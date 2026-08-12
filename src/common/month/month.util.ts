/** A month, as `YYYY-MM`. Rejects month 00 and anything above 12. */
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A quarter, as `YYYY-Q1` through `YYYY-Q4`. */
export const QUARTER_PATTERN = /^\d{4}-Q[1-4]$/;

/** Months in a year, and in a quarter. */
const MONTHS_IN_YEAR = 12;
const MONTHS_IN_QUARTER = 3;

/**
 * A month split into its parts.
 *
 * @property year - Four digit calendar year.
 * @property month - Month number, 1 through 12.
 */
export interface IMonthParts {
  year: number;
  month: number;
}

/**
 * Reports whether a value is a well formed month.
 *
 * @param value - The candidate, such as `2026-01`.
 * @returns True when it matches `YYYY-MM` and names a real month.
 */
export const isValidMonth = (value: string): boolean => MONTH_PATTERN.test(value);

/**
 * Splits a month into its year and month numbers.
 *
 * @param month - The month, as `YYYY-MM`.
 * @returns The parts.
 * @throws Error When the month is malformed.
 */
export const parseMonth = (month: string): IMonthParts => {
  if (!isValidMonth(month)) {
    throw new Error(`Invalid month "${month}". Expected YYYY-MM.`);
  }

  return { year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) };
};

/**
 * Builds a month string from its parts.
 *
 * @param year - Four digit calendar year.
 * @param month - Month number, 1 through 12.
 * @returns The month, as `YYYY-MM`.
 * @throws Error When the month number is out of range.
 */
export const formatMonth = (year: number, month: number): string => {
  if (!Number.isInteger(month) || month < 1 || month > MONTHS_IN_YEAR) {
    throw new Error(`Invalid month number ${String(month)}. Expected 1 through 12.`);
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
};

/**
 * Orders two months.
 *
 * @remarks
 * A plain string comparison, which is the reason the format was chosen: it sorts
 * chronologically without parsing, so a date range is an indexed `$gte` and
 * `$lte` in the database rather than a computed field.
 *
 * @param first - The first month.
 * @param second - The second month.
 * @returns Negative when the first is earlier, zero when equal, positive otherwise.
 */
export const compareMonths = (first: string, second: string): number => first.localeCompare(second);

/**
 * Shifts a month forward or backward.
 *
 * @remarks
 * Works on a zero based absolute month index rather than on the 1 through 12
 * value, so crossing a year boundary cannot produce a month 13 or a month 0.
 *
 * @param month - The starting month, as `YYYY-MM`.
 * @param count - How many months to move. Negative moves backwards.
 * @returns The resulting month.
 * @throws Error When the starting month is malformed.
 */
export const addMonths = (month: string, count: number): string => {
  const { year, month: monthNumber } = parseMonth(month);
  const absoluteIndex = year * MONTHS_IN_YEAR + (monthNumber - 1) + count;

  return formatMonth(Math.floor(absoluteIndex / MONTHS_IN_YEAR), (absoluteIndex % MONTHS_IN_YEAR) + 1);
};

/**
 * Lists every month in an inclusive range.
 *
 * @param from - First month in the range.
 * @param to - Last month in the range.
 * @returns The months in order. Empty when the range runs backwards.
 * @throws Error When either bound is malformed.
 */
export const monthsInRange = (from: string, to: string): string[] => {
  parseMonth(from);
  parseMonth(to);

  const months: string[] = [];
  let cursor = from;

  while (compareMonths(cursor, to) <= 0) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }

  return months;
};

/**
 * Lists the three months of a calendar quarter.
 *
 * @remarks
 * Quarters are calendar quarters: Q1 is January through March, regardless of a
 * user's fiscal year start. Locking a quarter writes three month locks, so the
 * lock data shape stays month based.
 *
 * @param quarter - The quarter, as `2026-Q1`.
 * @returns Its three months, in order.
 * @throws Error When the quarter is malformed.
 */
export const quarterMonths = (quarter: string): string[] => {
  if (!QUARTER_PATTERN.test(quarter)) {
    throw new Error(`Invalid quarter "${quarter}". Expected YYYY-Q1 through YYYY-Q4.`);
  }

  const year = Number(quarter.slice(0, 4));
  const quarterNumber = Number(quarter.slice(6, 7));
  const firstMonth = (quarterNumber - 1) * MONTHS_IN_QUARTER + 1;

  return monthsInRange(formatMonth(year, firstMonth), formatMonth(year, firstMonth + MONTHS_IN_QUARTER - 1));
};

/**
 * Resolves a fiscal year to the month range it covers.
 *
 * @remarks
 * A fiscal year is named for the calendar year it starts in. With a start month
 * of January, fiscal 2026 is `2026-01` through `2026-12`, which is the calendar
 * year and the default. With a start month of April, fiscal 2026 is `2026-04`
 * through `2027-03`.
 *
 * @param fiscalYear - The year the fiscal year starts in.
 * @param startMonth - The month the fiscal year starts, 1 through 12.
 * @returns The inclusive first and last months.
 * @throws Error When the start month is out of range.
 */
export const fiscalYearRange = (fiscalYear: number, startMonth: number): { from: string; to: string } => {
  const from = formatMonth(fiscalYear, startMonth);

  return { from, to: addMonths(from, MONTHS_IN_YEAR - 1) };
};
