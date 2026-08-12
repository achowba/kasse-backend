/**
 * What a chart series is grouped by.
 *
 * @remarks
 * The report table is category by month. A chart is almost always one axis of
 * that: spend over time, or spend by category over the whole range. Serving both
 * from one endpoint keeps the numbers identical to the table's, because they come
 * from the same aggregation rather than from a second implementation.
 *
 * @property MONTH - One point per month, summed across every category.
 * @property CATEGORY - One point per category, summed across every month in range.
 */
export enum SeriesGroupByEnum {
  MONTH = 'month',
  CATEGORY = 'category',
}
