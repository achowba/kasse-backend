/**
 * Minor units per major unit.
 *
 * @remarks
 * Two decimal places, as every supported currency uses. Adding a currency with a
 * different exponent, such as JPY with none, means this stops being a single
 * number and the helpers have to take the currency into account.
 */
export const MINOR_UNITS_PER_MAJOR = 100;

/**
 * Accepted amount text.
 *
 * @remarks
 * An optional sign, digits with optional thousands separators, and at most two
 * decimal places. Deliberately does not accept exponent notation or accounting
 * style parentheses for negatives, both of which are ambiguous enough to be worth
 * rejecting rather than guessing at.
 */
export const AMOUNT_PATTERN = /^([+-]?)(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/;

/** Decimal places a variance percentage is reported to. */
export const PERCENT_DECIMAL_PLACES = 2;
