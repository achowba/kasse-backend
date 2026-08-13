/**
 * Header and body paths pino scrubs before a request line is written.
 *
 * @remarks
 * These stay as pino paths rather than moving into {@link REDACTED_LOG_KEYS},
 * because they are scrubbed by `pino-http` on the serialised request and response
 * rather than by the recursive walk. Both mechanisms exist and neither replaces
 * the other: this one is exact and cheap on a known shape, the walk below is for
 * context nobody predicted.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.token',
  'req.body.refreshToken',
];

/**
 * Keys whose values are replaced wherever they appear in a log context.
 *
 * @remarks
 * "No secret in a log" is a stated invariant, and before this it was upheld by
 * pino's path patterns, which reach exactly as far as they are written. `*.token`
 * matches one level, so a token at `{ user: { profile: { token } } }` survived.
 * Anything a caller nests deeper than the pattern anticipated survived, which
 * means the invariant held only for shapes somebody had already thought of.
 *
 * This list is matched at any depth, case insensitively, so `Authorization` and
 * `authorization` are both caught.
 *
 * It is a backstop, not a licence to pass secrets around. Keep it narrow:
 * over-redacting hides the context that makes a log line worth having.
 */
export const REDACTED_LOG_KEYS: ReadonlySet<string> = new Set([
  'accesstoken',
  'apikey',
  'authorization',
  'cookie',
  'idempotencykey',
  'password',
  'passwordhash',
  'refreshtoken',
  'secret',
  'token',
]);

/** The placeholder written in place of a redacted value. */
export const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * The placeholder written where a value refers back to something already on the
 * current path.
 *
 * @remarks
 * Without it a cyclic context would survive the redactor and then throw inside
 * the serialiser, turning a log call into a request failure. A log line must
 * never be the thing that breaks a request.
 */
export const CIRCULAR_PLACEHOLDER = '[CIRCULAR]';

/**
 * The placeholder written where a value is still nested at {@link REDACTION_MAX_DEPTH}.
 *
 * @remarks
 * Replacing rather than returning the untouched subtree matters: returning it
 * would let an unredacted, possibly cyclic branch escape the walk, which is the
 * exact thing the walk exists to prevent.
 */
export const TRUNCATED_PLACEHOLDER = '[TRUNCATED]';

/**
 * How deep the redactor walks into a log context before stopping.
 *
 * @remarks
 * Bounds the cost of formatting a deeply nested or cyclic object. Formatting a
 * log line must never become the expensive part of a request.
 */
export const REDACTION_MAX_DEPTH = 6;

/**
 * Keys the logger owns on an entry, which the redactor leaves alone.
 *
 * @remarks
 * Walking them would rewrite pino's own fields, and none of them can carry a
 * caller supplied secret.
 */
export const RESERVED_ENTRY_KEYS: ReadonlySet<string> = new Set(['level', 'time', 'msg', 'pid', 'hostname']);

/**
 * Paths that are too noisy to log on every hit.
 *
 * @remarks
 * A probe every few seconds would otherwise dominate the logs and make the
 * requests that matter harder to find.
 */
export const UNLOGGED_PATHS = ['/api/v1/health', '/api/v1/health/ready', '/docs', '/docs-json'];
