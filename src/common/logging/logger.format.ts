import type { IncomingMessage } from 'node:http';
import { Types } from 'mongoose';
import { logUser } from './log-context';
import {
  CIRCULAR_PLACEHOLDER,
  REDACTED_LOG_KEYS,
  REDACTED_PLACEHOLDER,
  REDACTION_MAX_DEPTH,
  REQUEST_LOG_CONTEXT,
  RESERVED_ENTRY_KEYS,
  TRUNCATED_PLACEHOLDER,
} from './logging.constants';

/**
 * Replaces the value of any sensitive key, at any depth, with a placeholder.
 *
 * @remarks
 * Arrays and plain objects are walked; anything else is returned untouched, so a
 * `Date`, a `Buffer`, an `ObjectId`, or an `Error` is not flattened into an
 * unreadable shape. That check is `Object.getPrototypeOf(value) !== Object.prototype`
 * rather than a `typeof` test, because a Mongoose document and an `ObjectId` are
 * both objects and neither survives being rebuilt key by key.
 *
 * A value already seen on the current path becomes a circular marker, so a cyclic
 * context cannot reach the serialiser and throw there. The walk stops at
 * {@link REDACTION_MAX_DEPTH}, and a value still nested at that point is
 * **replaced** rather than returned, so no reference to an unwalked subtree
 * escapes.
 *
 * `seen` is a path set rather than a visited set: an entry is removed on the way
 * back up, so the same object appearing twice as siblings is redacted twice
 * rather than being wrongly called circular the second time.
 *
 * @steps
 * 1. Return primitives and null as they are.
 * 2. Replace anything already on the current path.
 * 3. Replace anything still nested at the depth limit.
 * 4. Return any non plain object untouched.
 * 5. Walk arrays and plain objects, replacing the value of every sensitive key.
 *
 * @param value - The value to scrub.
 * @param depth - The current recursion depth.
 * @param seen - Objects already on this path.
 * @returns The value, with sensitive and cyclic entries replaced.
 */
export const redactValue = (value: unknown, depth: number, seen: WeakSet<object>): unknown => {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return CIRCULAR_PLACEHOLDER;
  }

  if (depth >= REDACTION_MAX_DEPTH) {
    return TRUNCATED_PLACEHOLDER;
  }

  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }

  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((entry: unknown) => redactValue(entry, depth + 1, seen));
    }

    const result: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      result[key] = REDACTED_LOG_KEYS.has(key.toLowerCase()) ? REDACTED_PLACEHOLDER : redactValue(entry, depth + 1, seen);
    }

    return result;
  } finally {
    // Removed on the way back up, so this is the path rather than everything
    // ever visited.
    seen.delete(value);
  }
};

/**
 * Scrubs a whole log entry.
 *
 * @remarks
 * Wired as pino's `formatters.log`, which runs on the merged object of every log
 * call, so it covers context a call site invented rather than only the shapes the
 * path patterns anticipated.
 *
 * Keys the logger owns are skipped: walking them would rewrite pino's own fields,
 * and none of them can carry a caller supplied secret.
 *
 * @param entry - The merged log object.
 * @returns The entry, scrubbed.
 */
export const redactEntry = (entry: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(entry)) {
    if (RESERVED_ENTRY_KEYS.has(key)) {
      result[key] = value;

      continue;
    }

    result[key] = REDACTED_LOG_KEYS.has(key.toLowerCase()) ? REDACTED_PLACEHOLDER : redactValue(value, 0, new WeakSet<object>());
  }

  return result;
};

/**
 * Builds the fields stamped on a request line, including the scrubbed body.
 *
 * @remarks
 * `pino-http` logs no request body. Its standard serialiser emits the method,
 * URL, query, route params, headers, and peer address, so a payload was never a
 * candidate for a log line and the `req.body.*` entries in `REDACTED_PATHS`
 * matched nothing.
 *
 * This is `customProps` rather than a `req` serialiser, and the difference is
 * not cosmetic. `pino` serialises a child logger's bindings **eagerly**, at the
 * moment the child is created, which `pino-http` does when the middleware is
 * entered. The body parser has not run at that point, so a `req` serialiser sees
 * no body however it is written. `customProps` is called when the line is
 * actually written, on response finish, by which time the parser has populated
 * it. A bodyless request contributes nothing, so a `GET` line is unchanged.
 *
 * The body is scrubbed by key at any depth rather than by path. `redactEntry`
 * would reach it anyway, since it is a plain object at the top level of the
 * entry, but doing it here keeps the guarantee inside the function that
 * introduces the risk instead of resting on a walk configured elsewhere.
 *
 * @steps
 * 1. Read the parsed body, when the parser has produced one.
 * 2. Stamp the request context, so these lines filter with the rest.
 * 3. Add the body, scrubbed, when there is one.
 *
 * @param request - The incoming request, after body parsing.
 * @returns The extra fields for this request's log line.
 */
export const buildRequestProps = (request: IncomingMessage): Record<string, unknown> => {
  const body: unknown = 'body' in request ? request.body : undefined;
  const user = readAuthenticatedUser(request);

  return {
    context: REQUEST_LOG_CONTEXT,
    ...(user === null ? {} : logUser(user.id, user.email)),
    ...(body === undefined ? {} : { requestBody: redactValue(body, 0, new WeakSet<object>()) }),
  };
};

/**
 * Reads the authenticated account's id off a request, when there is one.
 *
 * @remarks
 * Structural rather than typed against `IAuthenticatedUser`, deliberately. This
 * module is a leaf that everything logging depends on, and importing the auth
 * types to read one field would give it a dependency on a feature module for the
 * sake of a property name.
 *
 * The guard populates this after the middleware has run, which is why it is read
 * here in `customProps` at write time rather than captured on entry. An
 * unauthenticated request, a public route, or a rejected token all leave it
 * absent, so those lines simply carry no user and are still logged.
 *
 * @param request - The incoming request, after the guard.
 * @returns The account id as a string, or null when nobody is authenticated.
 */
const readAuthenticatedUser = (request: IncomingMessage): { id: string; email?: string } | null => {
  if (!('user' in request)) {
    return null;
  }

  const user: unknown = request.user;

  if (typeof user !== 'object' || user === null || !('userId' in user)) {
    return null;
  }

  const id = readIdentifier(user.userId);

  if (id === null) {
    return null;
  }

  const email = 'email' in user && typeof user.email === 'string' ? user.email : undefined;

  return { id, email };
};

/**
 * Turns whatever is on the request into an identifier, or refuses to.
 *
 * @remarks
 * Narrowed to the two types this is ever set to rather than stringified
 * loosely. Anything else reaching `String()` logs `[object Object]`, which is
 * worse than logging nothing: it looks like an identifier, it groups every
 * account under one value, and it would be believed.
 *
 * @param value - The `userId` found on the request.
 * @returns The identifier as a string, or null when it is not one.
 */
const readIdentifier = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value;
  }

  return value instanceof Types.ObjectId ? value.toHexString() : null;
};
