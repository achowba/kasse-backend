/**
 * How long a cached report survives without being invalidated.
 *
 * @remarks
 * A backstop, not the mechanism. Invalidation is exact: any write to a plan, an
 * expense, or a period lock bumps the account's cache version, so a stale report
 * is never served. This exists only so that an entry for an account that has
 * stopped writing eventually leaves memory.
 */
export const REPORT_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * How many accounts' reports are held before the least recently used is dropped.
 *
 * @remarks
 * The cache is per process and unbounded growth would be a slow leak on a busy
 * instance. Dropping an entry costs one aggregation, which is the cost of a cold
 * read rather than a wrong answer.
 */
export const REPORT_CACHE_MAX_ENTRIES = 500;

/**
 * The name of the collection the report unions into the plan side.
 *
 * @remarks
 * Named here because `$unionWith` takes a collection name as a string, which no
 * amount of typing will check. If the expense collection is ever renamed, this
 * is the line that has to move with it.
 */
export const EXPENSES_COLLECTION = 'expenses';

/** The collection the report resolves category names from. */
export const CATEGORIES_COLLECTION = 'categories';
