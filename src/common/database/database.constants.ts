/**
 * How long to wait for a server before failing a connection attempt.
 *
 * @remarks
 * The driver default is 30 seconds, which turns a wrong connection string into a
 * boot that appears to hang. Five seconds turns the same mistake into a fast,
 * legible failure.
 */
export const SERVER_SELECTION_TIMEOUT_MS = 5_000;

/** Upper bound on pooled connections per instance. */
export const MAX_POOL_SIZE = 20;

/**
 * MongoDB's error code for a unique index violation.
 *
 * @remarks
 * Worth naming, because the number alone in a catch block reads as a magic
 * value and the difference between tolerating a duplicate and swallowing a real
 * failure depends on getting it right.
 */
export const DUPLICATE_KEY_ERROR = 11_000;
