import {
  CIRCULAR_PLACEHOLDER,
  REDACTED_LOG_KEYS,
  REDACTED_PLACEHOLDER,
  REDACTION_MAX_DEPTH,
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
