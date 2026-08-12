import { PaginationQueryDto } from './pagination-query.dto';

/**
 * Where a page sits in the whole result set.
 *
 * @property limit - How many records were requested.
 * @property offset - How many records were skipped.
 * @property total - How many records match the filter, across every page.
 */
export interface IPagination {
  limit: number;
  offset: number;
  total: number;
}

/**
 * The shape every list endpoint returns.
 *
 * @typeParam TItem - The record type in the page.
 * @property items - The records on this page.
 * @property pagination - Where this page sits in the whole result set.
 */
export interface IPaginatedResponse<TItem> {
  items: TItem[];
  pagination: IPagination;
}

/**
 * Wraps a page of records in the standard envelope.
 *
 * @remarks
 * `total` is counted over the whole filtered set, not the page. A client cannot
 * compute the number of pages otherwise, and a report's totals would disagree
 * with its own table.
 *
 * @typeParam TItem - The record type in the page.
 * @param items - The records on this page.
 * @param total - How many records match the filter in total.
 * @param query - The pagination the caller asked for.
 * @returns The paginated response.
 */
export const toPaginatedResponse = <TItem>(
  items: TItem[],
  total: number,
  query: PaginationQueryDto,
): IPaginatedResponse<TItem> => ({
  items,
  pagination: { limit: query.limit, offset: query.offset, total },
});
