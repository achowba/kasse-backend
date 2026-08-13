import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { MissingActualPolicyEnum } from '@common/money';
import { Plan } from '@modules/plans';
import { CATEGORIES_COLLECTION, EXPENSES_COLLECTION } from './reports.constants';
import { SeriesGroupByEnum } from './reports.enums';
import { varianceStage } from './variance.stage';

/**
 * One category and month, with both sides summed.
 *
 * @property categoryId - The category.
 * @property categoryName - Its name, resolved in the aggregation.
 * @property month - The month, as `YYYY-MM`.
 * @property planMinor - The target, or 0 when nothing was planned.
 * @property actualMinor - Logged spend. Null under the `null` policy when nothing was logged.
 * @property varianceMinor - Actual minus plan, computed in the pipeline. Null when the actual is null.
 * @property variancePercent - The variance over the plan, to two decimal places. Null when the plan is 0.
 * @property hasPlan - Whether a target exists, so a target of 0 is distinguishable from no target.
 * @property hasActual - Whether anything was logged, so logged 0 is distinguishable from nothing logged.
 */
export interface IReportCell {
  categoryId: Types.ObjectId;
  categoryName: string;
  month: string;
  planMinor: number;
  actualMinor: number | null;
  varianceMinor: number | null;
  variancePercent: number | null;
  hasPlan: boolean;
  hasActual: boolean;
}

/**
 * Both sides summed across the whole range.
 *
 * @property planMinor - Every target in range.
 * @property actualMinor - Every expense in range.
 */
export interface IReportTotals {
  planMinor: number;
  actualMinor: number;
}

/**
 * One point of a chart series.
 *
 * @property key - The month or the category id the point is grouped under.
 * @property label - What to render on the axis.
 * @property planMinor - Planned, summed for this point.
 * @property actualMinor - Logged, summed for this point.
 */
export interface ISeriesPoint {
  key: string;
  label: string;
  planMinor: number;
  actualMinor: number;
}

/**
 * The aggregation behind the plan against actual report.
 *
 * @remarks
 * The whole report is one round trip. The alternative, reading plans and expenses
 * separately and joining them in memory, would move a join the database is built
 * for into the API process and paginate it wrongly.
 *
 * **Why a union rather than a lookup from the plan side.** A `$lookup` from plans
 * to expenses drops any category that has spend but no target, and that case is
 * not an edge case: it is unplanned spend, which is the single most interesting
 * row in a variance report. Unioning both sides into one stream and grouping keeps
 * a cell that exists on either side alone.
 */
@Injectable()
export class ReportsRepository {
  constructor(@InjectModel(Plan.name) private readonly planModel: Model<Plan>) {}

  /**
   * Reads a page of report cells, the totals for the whole range, and the row count.
   *
   * @remarks
   * `$facet` computes all three from one pass over the same grouped stream. The
   * totals and the count therefore describe the entire range while only a page of
   * rows comes back, so a paginated table and the summary above it can never
   * disagree.
   *
   * @steps
   * 1. Read the plan side, scoped to the account and the month range, and project
   *    it into the shared cell shape with the expense side zeroed.
   * 2. Union the expense side, projected into the same shape with the plan side
   *    zeroed.
   * 3. Group by category and month, summing both amounts. The flags are `$max`
   *    over booleans, which reports true when either side contributed.
   * 4. Resolve category names, projecting only the name so the join does not drag
   *    whole documents through.
   * 5. Split into rows, totals, and count, computing variance on the page of rows
   *    once it has been cut.
   *
   * @param userId - The authenticated caller.
   * @param from - First month of the range, inclusive.
   * @param to - Last month of the range, inclusive.
   * @param categoryIds - Restrict to these categories, or every category when empty.
   * @param limit - How many rows to return.
   * @param offset - How many rows to skip.
   * @param policy - How to treat a cell with a plan but nothing logged.
   * @returns The page of cells with variance computed, the totals across the range, and the row count.
   */
  async aggregate(
    userId: Types.ObjectId,
    from: string,
    to: string,
    categoryIds: Types.ObjectId[],
    limit: number,
    offset: number,
    policy: MissingActualPolicyEnum,
  ): Promise<{ cells: IReportCell[]; totals: IReportTotals; total: number }> {
    const pipeline: PipelineStage[] = [
      ...this.unionedSides(userId, from, to, categoryIds),
      ...this.groupAndName(),
      {
        $facet: {
          rows: [
            // Month first, then name. A reader scans a variance report a period
            // at a time, and the name breaks ties so the order is stable across
            // pages rather than left to the storage engine.
            { $sort: { month: 1, categoryName: 1 } },
            { $skip: offset },
            { $limit: limit },
            // After the page is cut, so the arithmetic runs for the rows being
            // returned rather than for every cell in the range.
            varianceStage(policy),
          ],
          totals: [
            {
              $group: {
                _id: null,
                planMinor: { $sum: '$planMinor' },
                actualMinor: { $sum: '$actualMinor' },
              },
            },
          ],
          count: [{ $count: 'value' }],
        },
      },
    ];

    const [result] = await this.planModel.aggregate<{
      rows: IReportCell[];
      totals: IReportTotals[];
      count: { value: number }[];
    }>(pipeline);

    return {
      cells: result?.rows ?? [],
      // An empty range produces empty facets rather than zeroed ones, because
      // there is nothing for `$group` to run over. Zero is the right answer.
      totals: result?.totals[0] ?? { planMinor: 0, actualMinor: 0 },
      total: result?.count[0]?.value ?? 0,
    };
  }

  /**
   * Reads the same numbers collapsed onto one axis, for a chart.
   *
   * @remarks
   * Unpaginated on purpose. A chart needs every point in the range, and rebuilding
   * one from a page of table rows would draw a line that stops partway through the
   * year. It shares the pipeline above up to the grouping, so a chart and the table
   * beside it cannot disagree.
   *
   * @param userId - The authenticated caller.
   * @param from - First month of the range, inclusive.
   * @param to - Last month of the range, inclusive.
   * @param categoryIds - Restrict to these categories, or every category when empty.
   * @param groupBy - Whether each point is a month or a category.
   * @returns The points, in axis order.
   */
  async series(
    userId: Types.ObjectId,
    from: string,
    to: string,
    categoryIds: Types.ObjectId[],
    groupBy: SeriesGroupByEnum,
  ): Promise<ISeriesPoint[]> {
    const byMonth = groupBy === SeriesGroupByEnum.MONTH;

    return await this.planModel.aggregate<ISeriesPoint>([
      ...this.unionedSides(userId, from, to, categoryIds),
      ...this.groupAndName(),
      {
        $group: {
          _id: byMonth ? '$month' : '$categoryId',
          // Months sort as themselves; categories need their name carried
          // through the grouping to be labelled.
          label: { $first: byMonth ? '$month' : '$categoryName' },
          planMinor: { $sum: '$planMinor' },
          actualMinor: { $sum: '$actualMinor' },
        },
      },
      { $project: { _id: 0, key: { $toString: '$_id' }, label: 1, planMinor: 1, actualMinor: 1 } },
      { $sort: byMonth ? { key: 1 } : { label: 1 } },
    ]);
  }

  /**
   * Projects both sides into one stream of comparable rows.
   *
   * @remarks
   * Every `$match` carries `deletedAt: null` as well as the owner. Soft delete is
   * applied by the base repository everywhere else, and an aggregation bypasses
   * that entirely, so omitting it here would resurrect deleted plans and expenses
   * in reports while every other read hid them.
   *
   * @param userId - The authenticated caller.
   * @param from - First month of the range, inclusive.
   * @param to - Last month of the range, inclusive.
   * @param categoryIds - Restrict to these categories, or every category when empty.
   * @returns The stages that produce the unioned stream.
   */
  private unionedSides(userId: Types.ObjectId, from: string, to: string, categoryIds: Types.ObjectId[]): PipelineStage[] {
    const scope = (): Record<string, unknown> => ({
      userId,
      deletedAt: null,
      month: { $gte: from, $lte: to },
      ...(categoryIds.length > 0 ? { categoryId: { $in: categoryIds } } : {}),
    });

    return [
      { $match: scope() },
      {
        $project: {
          _id: 0,
          categoryId: 1,
          month: 1,
          planMinor: '$targetMinor',
          actualMinor: { $literal: 0 },
          hasPlan: { $literal: true },
          hasActual: { $literal: false },
        },
      },
      {
        $unionWith: {
          coll: EXPENSES_COLLECTION,
          pipeline: [
            { $match: scope() },
            {
              $project: {
                _id: 0,
                categoryId: 1,
                month: 1,
                planMinor: { $literal: 0 },
                actualMinor: '$amountMinor',
                hasPlan: { $literal: false },
                hasActual: { $literal: true },
              },
            },
          ],
        },
      },
    ];
  }

  /**
   * Collapses the stream into one row per cell and attaches the category name.
   *
   * @remarks
   * `$max` over the boolean flags is how a cell learns that either side
   * contributed: false sorts below true, so the maximum is true when any row had
   * it set. Summing instead would produce a count, and counting is not the
   * question being asked.
   *
   * @returns The grouping and naming stages.
   */
  private groupAndName(): PipelineStage[] {
    return [
      {
        $group: {
          _id: { categoryId: '$categoryId', month: '$month' },
          planMinor: { $sum: '$planMinor' },
          actualMinor: { $sum: '$actualMinor' },
          hasPlan: { $max: '$hasPlan' },
          hasActual: { $max: '$hasActual' },
        },
      },
      {
        $lookup: {
          from: CATEGORIES_COLLECTION,
          localField: '_id.categoryId',
          foreignField: '_id',
          // Only the name. Without this the join drags whole category documents
          // through the pipeline for a single string.
          pipeline: [{ $project: { name: 1 } }],
          as: 'category',
        },
      },
      {
        $project: {
          _id: 0,
          categoryId: '$_id.categoryId',
          month: '$_id.month',
          // A category deleted after the fact still has to name itself, or a
          // locked period stops explaining its own numbers.
          categoryName: { $ifNull: [{ $first: '$category.name' }, 'Unknown category'] },
          planMinor: 1,
          actualMinor: 1,
          hasPlan: 1,
          hasActual: 1,
        },
      },
    ];
  }
}
