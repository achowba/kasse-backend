/** Minor units per major unit. Two decimal places, as every supported currency uses. */
const MINOR_UNITS_PER_MAJOR = 100;

/**
 * Accepted amount text: an optional sign, digits with optional thousands
 * separators, and at most two decimal places.
 */
const AMOUNT_PATTERN = /^([+-]?)(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parses an amount written by a person into minor units.
 *
 * @remarks
 * Reads the digits out of the string rather than multiplying a parsed float by
 * 100, which is not safe: `12.345` is stored as `12.34499999999999886`, so
 * `Math.round(12.345 * 100)` yields `1234` rather than `1235`. Working from the
 * characters is exact for every input this accepts.
 *
 * Accepts `4800`, `4,800`, `4800.55`, and `-19.80`. Rejects an empty string,
 * more than two decimal places, and accounting style parentheses for negatives,
 * which are ambiguous enough to be worth rejecting rather than guessing at.
 *
 * @param raw - The amount as written, for example in a CSV cell.
 * @returns The amount in minor units.
 * @throws Error When the text is not an amount this accepts.
 */
export const parseAmountToMinor = (raw: string): number => {
  const trimmed = raw.trim();
  const match = AMOUNT_PATTERN.exec(trimmed);

  if (match === null) {
    throw new Error(`Invalid amount "${raw}". Expected a number with at most two decimal places.`);
  }

  const [, sign = '', wholePart = '0', fractionPart = ''] = match;
  const whole = Number(wholePart.replaceAll(',', ''));
  const fraction = Number(fractionPart.padEnd(2, '0').slice(0, 2) || '0');
  const magnitude = whole * MINOR_UNITS_PER_MAJOR + fraction;

  return sign === '-' ? -magnitude : magnitude;
};

/**
 * Renders minor units as a decimal string.
 *
 * @remarks
 * Used for CSV export and for anywhere a person reads the number. Builds the
 * string from integer arithmetic, so no rounding happens on the way out.
 *
 * @param minorUnits - The amount in minor units.
 * @returns The amount with exactly two decimal places, such as `-19.80`.
 */
export const formatMinorAsMajor = (minorUnits: number): string => {
  const sign = minorUnits < 0 ? '-' : '';
  const magnitude = Math.abs(minorUnits);
  const whole = Math.trunc(magnitude / MINOR_UNITS_PER_MAJOR);
  const fraction = magnitude % MINOR_UNITS_PER_MAJOR;

  return `${sign}${String(whole)}.${String(fraction).padStart(2, '0')}`;
};

/**
 * Reports whether an amount is a whole number of minor units that arithmetic
 * can be trusted on.
 *
 * @remarks
 * Minor units are stored as a BSON double, which represents integers exactly up
 * to 2^53. That is about 90 trillion in major units, far beyond any real budget,
 * so the bound is a guard against corrupt input rather than a business limit.
 *
 * @param value - The candidate amount in minor units.
 * @returns True when the value is a safe integer.
 */
export const isSafeMinorAmount = (value: number): boolean => Number.isSafeInteger(value);
