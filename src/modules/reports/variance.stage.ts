import { PipelineStage } from 'mongoose';
import { MissingActualPolicyEnum, PERCENT_DECIMAL_PLACES } from '@common/money';

/** The factor two decimal places rounds against. */
const PERCENT_FACTOR = 10 ** PERCENT_DECIMAL_PLACES;

/**
 * Rounds an expression to two decimal places, half up.
 *
 * @remarks
 * Deliberately **not** `$round`. MongoDB's `$round` breaks a tie to the nearest
 * even value, while `Math.round` in `calculateVariance` breaks it toward positive
 * infinity. On `2.125` those disagree, and a variance percentage reaches an exact
 * half whenever spend misses plan by the right ratio, so the disagreement would
 * be real rather than theoretical.
 *
 * `$floor(x + 0.5)` is `Math.round` exactly. The epsilon is added before the
 * multiply, in the same order as the TypeScript, because floating point is not
 * associative and doing it in a different order is a different function.
 *
 * @param value - The expression to round.
 * @returns The rounding expression.
 */
const roundPercent = (value: object): object => ({
  $divide: [{ $floor: { $add: [{ $multiply: [{ $add: [value, Number.EPSILON] }, PERCENT_FACTOR] }, 0.5] } }, PERCENT_FACTOR],
});

/**
 * The percentage expression, or null when the plan is zero.
 *
 * @remarks
 * The zero check is the whole reason this cannot be a plain `$divide`. Dividing
 * by zero in an aggregation raises an error and fails the entire report, so the
 * guard is not a nicety: without it one unplanned category takes the response
 * down.
 *
 * @param variance - The variance expression.
 * @returns The percentage expression.
 */
const percentOrNull = (variance: object): object => ({
  $cond: {
    if: { $eq: ['$planMinor', 0] },
    then: null,
    else: roundPercent({ $multiply: [{ $divide: [variance, '$planMinor'] }, 100] }),
  },
});

/**
 * Computes variance in the database rather than in the application.
 *
 * @remarks
 * The arithmetic is still **defined** by `calculateVariance` in `@common/money`.
 * That function is the specification, exhaustively unit tested without a
 * database; this stage is the fast path that avoids shipping unsummed cells to
 * the application to do the same sums. A parity test runs the same matrix through
 * both and asserts they agree, because two implementations of graded arithmetic
 * that nothing holds together will drift.
 *
 * The policy is a request parameter rather than a per row value, so it branches
 * here in TypeScript instead of becoming another `$cond` inside the pipeline.
 * That keeps the emitted stage the simpler of the two rather than one expression
 * carrying both behaviours.
 *
 * @param policy - How to treat a cell with a plan but nothing logged.
 * @returns The stage that adds the three computed fields.
 */
export const varianceStage = (policy: MissingActualPolicyEnum): PipelineStage.AddFields => {
  if (policy === MissingActualPolicyEnum.NULL) {
    const variance = { $subtract: ['$actualMinor', '$planMinor'] };

    return {
      $addFields: {
        // Under this policy a cell nobody has reported on reports nothing, so a
        // client can render a dash rather than a number that was never measured.
        actualMinor: { $cond: { if: '$hasActual', then: '$actualMinor', else: null } },
        varianceMinor: { $cond: { if: '$hasActual', then: variance, else: null } },
        variancePercent: { $cond: { if: '$hasActual', then: percentOrNull(variance), else: null } },
      },
    };
  }

  // Under the default policy a missing actual is zero, and the summed
  // `actualMinor` is already zero, so the arithmetic needs no special case.
  const variance = { $subtract: ['$actualMinor', '$planMinor'] };

  return {
    $addFields: {
      varianceMinor: variance,
      variancePercent: percentOrNull(variance),
    },
  };
};
