/**
 * How the report treats a category and month with a plan but nothing logged.
 *
 * @remarks
 * The assignment allows either reading, and asks only that it be consistent and
 * documented. `ZERO` is the default because it matches the primary numbers in the
 * published sample data, where February marketing shows a variance of the full
 * plan rather than a dash.
 *
 * @property ZERO - Treat a missing actual as `0`, so the variance is the whole plan.
 * @property NULL - Report the actual, variance, and percent as `null`, so a client can render a dash.
 */
export enum MissingActualPolicyEnum {
  ZERO = 'zero',
  NULL = 'null',
}

/**
 * One computed cell of the plan against actual report.
 *
 * @property planMinor - The target, in minor units. Zero when no plan exists.
 * @property actualMinor - Logged spend in minor units, or null under the NULL policy when nothing was logged.
 * @property varianceMinor - `actual - plan`. Negative means under plan. Null when the actual is null.
 * @property variancePercent - `(actual - plan) / plan * 100`, to two decimal places. Null when the plan is zero or the actual is null.
 * @property hasActual - Whether anything was actually logged, so a logged zero is never confused with nothing logged.
 */
export interface IVarianceResult {
  planMinor: number;
  actualMinor: number | null;
  varianceMinor: number | null;
  variancePercent: number | null;
  hasActual: boolean;
}

/** Percentages are reported to two decimal places. */
const PERCENT_DECIMAL_PLACES = 2;

/**
 * Rounds to two decimal places.
 *
 * @param value - The value to round.
 * @returns The value, rounded half away from zero at two decimal places.
 */
const roundPercent = (value: number): number => {
  const factor = 10 ** PERCENT_DECIMAL_PLACES;

  return Math.round((value + Number.EPSILON) * factor) / factor;
};

/**
 * Computes one report cell from a plan and an actual.
 *
 * @remarks
 * The rules this encodes, all of which the assignment calls out:
 *
 * - Variance is `actual - plan`, so a negative number means under plan.
 * - When the plan is zero the percentage is undefined, and this returns `null`
 *   rather than `NaN` or `Infinity`. The absolute variance is still returned,
 *   because it is well defined: spending against no plan is real overspend.
 * - A missing actual follows the policy. Under `ZERO` it becomes `0`, so the
 *   variance is the negative of the plan. Under `NULL` the actual, variance, and
 *   percent are all `null` and the client renders a dash.
 * - `hasActual` is always reported, so a genuine logged `0` is distinguishable
 *   from nothing logged whichever policy is in force.
 *
 * Kept as a pure function rather than an aggregation stage so it is exhaustively
 * testable, and so the table, the chart, and the CSV export cannot disagree.
 *
 * @param planMinor - The target in minor units. Zero when no plan exists.
 * @param actualMinor - Logged spend in minor units, or null when nothing was logged.
 * @param policy - How to treat a missing actual.
 * @returns The computed cell.
 */
export const calculateVariance = (
  planMinor: number,
  actualMinor: number | null,
  policy: MissingActualPolicyEnum = MissingActualPolicyEnum.ZERO,
): IVarianceResult => {
  const hasActual = actualMinor !== null;

  if (!hasActual && policy === MissingActualPolicyEnum.NULL) {
    return { planMinor, actualMinor: null, varianceMinor: null, variancePercent: null, hasActual: false };
  }

  const effectiveActual = actualMinor ?? 0;
  const varianceMinor = effectiveActual - planMinor;

  return {
    planMinor,
    actualMinor: effectiveActual,
    varianceMinor,
    variancePercent: planMinor === 0 ? null : roundPercent((varianceMinor / planMinor) * 100),
    hasActual,
  };
};
