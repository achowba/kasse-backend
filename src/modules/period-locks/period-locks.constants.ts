/**
 * Most months one request may close at once.
 *
 * @remarks
 * A year and a quarter of slack. The bound exists so a single request cannot ask
 * for an unbounded number of writes, not because closing more months is
 * meaningless.
 */
export const MAX_MONTHS_PER_REQUEST = 15;
