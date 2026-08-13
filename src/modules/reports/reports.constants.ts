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

/**
 * The most rows an export renders.
 *
 * @remarks
 * An export is unpaginated, because a spreadsheet of the first fifty rows is not
 * the report. That makes the row count a memory bound, so it is capped. Forty
 * categories over ten years is 4,800 rows, so this leaves room while keeping the
 * response a file rather than a download.
 */
export const MAX_EXPORT_ROWS = 10_000;

/**
 * The export's column headers.
 *
 * @remarks
 * Written for a person opening the file in a spreadsheet, so `Variance %` rather
 * than `variancePercent`. The import reads a different, narrower shape and does
 * not consume this file: exporting a report and re-importing it would mean
 * importing computed columns, which is not a thing that can be done.
 */
export const CSV_COLUMNS = ['Category', 'Month', 'Plan', 'Actual', 'Variance', 'Variance %'] as const;

/** The label on the appended totals row. */
export const CSV_TOTALS_LABEL = 'Total';

/**
 * The earliest fiscal year a report will resolve.
 *
 * @remarks
 * Bounds rather than business rules. A typo turning 2026 into 20260 would
 * otherwise resolve to a range no index can help with and no user meant.
 */
export const MIN_FISCAL_YEAR = 1970;

/** The latest fiscal year a report will resolve. */
export const MAX_FISCAL_YEAR = 2999;
