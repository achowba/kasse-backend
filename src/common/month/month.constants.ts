/**
 * A month, as `YYYY-MM`.
 *
 * @remarks
 * Rejects month 00 and anything above 12, so a malformed month fails validation
 * rather than reaching a query that silently matches nothing.
 */
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A quarter, as `YYYY-Q1` through `YYYY-Q4`. */
export const QUARTER_PATTERN = /^\d{4}-Q[1-4]$/;

/** Months in a year. Used to convert a month into an absolute index for arithmetic. */
export const MONTHS_IN_YEAR = 12;

/** Months in a quarter. */
export const MONTHS_IN_QUARTER = 3;
