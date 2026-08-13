import { BadRequestException, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { DataVersionService } from '@common/cache';
import { calculateVariance, MissingActualPolicyEnum } from '@common/money';
import { compareMonths } from '@common/month';
import { ReportQueryDTO } from './dto/report-query.dto';
import { ReportResponseDTO, ReportRowDTO, ReportTotalsDTO } from './dto/report-response.dto';
import { SeriesQueryDTO } from './dto/series-query.dto';
import { SeriesResponseDTO } from './dto/series-response.dto';
import { renderReportCsv } from './report-csv';
import { MAX_EXPORT_ROWS, REPORT_CACHE_MAX_ENTRIES, REPORT_CACHE_TTL_MS } from './reports.constants';
import { SeriesGroupByEnum } from './reports.enums';
import { IReportCell, IReportTotals, ReportsRepository } from './reports.repository';

/**
 * One cached answer.
 *
 * @property value - The response as it was computed.
 * @property expiresAt - When it stops being served, as a millisecond timestamp.
 */
interface ICacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * Plan against actual, with variance.
 *
 * @remarks
 * **Variance is computed here, not in the pipeline.** It is the piece the whole
 * report is judged on, and as a pure function over two integers it can be tested
 * exhaustively without a database: every branch of plan-is-zero, missing actual,
 * and negative amounts is a unit test rather than an aggregation fixture. The
 * database sums; this decides what those sums mean. At a scale where returning
 * unsummed cells is too much data, `calculateVariance` moves into `$addFields`
 * and the tests stay valid because the arithmetic is defined in one place.
 *
 * **Caching is exact, not time based.** A cached report is keyed by the account's
 * data version, which every write to a plan, an expense, or a lock increments.
 * A stale report is therefore unreachable rather than merely short lived, and the
 * TTL is only there so an idle account's entry eventually leaves memory.
 */
@Injectable()
export class ReportsService {
  private readonly cache = new Map<string, ICacheEntry>();

  constructor(
    private readonly reportsRepository: ReportsRepository,
    private readonly dataVersionService: DataVersionService,
  ) {}

  /**
   * Builds the plan against actual report.
   *
   * @steps
   * 1. Reject a backwards range, which would otherwise return an empty report
   *    that looks like an account with no data.
   * 2. Serve a cached answer when the account has not written since it was built.
   * 3. Aggregate the page, the totals, and the row count in one round trip.
   * 4. Turn each summed cell into a variance row, applying the missing actual
   *    policy.
   * 5. Compute the totals row from the range totals, never from the page.
   *
   * @param userId - The authenticated caller.
   * @param query - The range, filters, and paging.
   * @returns The rows, the totals for the range, and the pagination.
   * @throws BadRequestException When `to` is before `from`.
   */
  async planVsActual(userId: Types.ObjectId, query: ReportQueryDTO): Promise<ReportResponseDTO> {
    this.assertRangeOrdered(query.from, query.to);

    const policy = query.missingActuals ?? MissingActualPolicyEnum.ZERO;
    const cacheKey = this.buildKey(userId, 'report', query, policy);
    const cached = this.readCache<ReportResponseDTO>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    const categoryIds = (query.categoryIds ?? []).map((id: string) => new Types.ObjectId(id));
    const { cells, totals, total } = await this.reportsRepository.aggregate(
      userId,
      query.from,
      query.to,
      categoryIds,
      query.limit,
      query.offset,
    );

    const response: ReportResponseDTO = {
      items: cells.map((cell: IReportCell) => this.toRow(cell, policy)),
      totals: this.toTotals(totals),
      pagination: { limit: query.limit, offset: query.offset, total },
    };

    this.writeCache(cacheKey, response);

    return response;
  }

  /**
   * Builds a chart series over the same numbers.
   *
   * @param userId - The authenticated caller.
   * @param query - The range, filters, and axis.
   * @returns The points, in axis order.
   * @throws BadRequestException When `to` is before `from`.
   */
  async series(userId: Types.ObjectId, query: SeriesQueryDTO): Promise<SeriesResponseDTO> {
    this.assertRangeOrdered(query.from, query.to);

    const groupBy = query.groupBy ?? SeriesGroupByEnum.MONTH;
    const cacheKey = this.buildKey(userId, `series:${groupBy}`, query, MissingActualPolicyEnum.ZERO);
    const cached = this.readCache<SeriesResponseDTO>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    const categoryIds = (query.categoryIds ?? []).map((id: string) => new Types.ObjectId(id));
    const points = await this.reportsRepository.series(userId, query.from, query.to, categoryIds, groupBy);

    const response: SeriesResponseDTO = {
      groupBy,
      points: points.map((point) => ({
        ...point,
        varianceMinor: point.actualMinor - point.planMinor,
      })),
    };

    this.writeCache(cacheKey, response);

    return response;
  }

  /**
   * Renders the report as CSV.
   *
   * @remarks
   * Reuses {@link ReportsService.planVsActual} rather than reading the database
   * again, so an export and the table on screen cannot disagree. It also means
   * the export is served from the cache when the table was just read, which is
   * the common order: a user looks at the report, then downloads it.
   *
   * Unpaginated up to a cap. A spreadsheet of the first fifty rows is not the
   * report, so paging it would defeat the point.
   *
   * @param userId - The authenticated caller.
   * @param query - The range and filters.
   * @returns The CSV text and the filename to offer.
   * @throws BadRequestException When `to` is before `from`.
   */
  async exportCsv(userId: Types.ObjectId, query: ReportQueryDTO): Promise<{ csv: string; filename: string }> {
    const report = await this.planVsActual(userId, { ...query, limit: MAX_EXPORT_ROWS, offset: 0 });

    return {
      csv: renderReportCsv(report.items, report.totals),
      filename: `plan-vs-actual-${query.from}-to-${query.to}.csv`,
    };
  }

  /**
   * Turns one summed cell into a variance row.
   *
   * @remarks
   * `hasActual` comes from the aggregation rather than from the amount, which is
   * the distinction the whole policy rests on. A category with an expense of 0
   * logged against it has an actual; one with no expenses at all does not, and
   * both sum to 0. Deciding from the sum would report them identically.
   *
   * @param cell - The summed cell.
   * @param policy - How to treat a cell with a plan but nothing logged.
   * @returns The row as a client sees it.
   */
  private toRow(cell: IReportCell, policy: MissingActualPolicyEnum): ReportRowDTO {
    const variance = calculateVariance(cell.planMinor, cell.hasActual ? cell.actualMinor : null, policy);

    return {
      categoryId: cell.categoryId.toString(),
      categoryName: cell.categoryName,
      month: cell.month,
      planMinor: variance.planMinor,
      actualMinor: variance.actualMinor,
      varianceMinor: variance.varianceMinor,
      variancePercent: variance.variancePercent,
      hasPlan: cell.hasPlan,
      hasActual: cell.hasActual,
    };
  }

  /**
   * Turns the range totals into the summary row.
   *
   * @remarks
   * Always under the `zero` policy regardless of what the rows use. A total is a
   * sum of real amounts, and a null in the middle of a column of money is not a
   * number a reader can add up. The rows still show the dash where one belongs.
   *
   * @param totals - Both sides summed across the range.
   * @returns The summary, with its own variance.
   */
  private toTotals(totals: IReportTotals): ReportTotalsDTO {
    const variance = calculateVariance(totals.planMinor, totals.actualMinor, MissingActualPolicyEnum.ZERO);

    return {
      planMinor: totals.planMinor,
      actualMinor: totals.actualMinor,
      varianceMinor: variance.varianceMinor ?? 0,
      variancePercent: variance.variancePercent,
    };
  }

  /**
   * Rejects a range that runs backwards.
   *
   * @remarks
   * A `$gte`/`$lte` pair with the bounds swapped matches nothing, so the report
   * would come back empty and read as an account with no data rather than as a
   * mistyped request.
   *
   * @param from - First month of the range.
   * @param to - Last month of the range.
   * @throws BadRequestException When `to` is before `from`.
   */
  private assertRangeOrdered(from: string, to: string): void {
    if (compareMonths(from, to) > 0) {
      throw new BadRequestException(`The range ends before it starts: from ${from} is after to ${to}.`);
    }
  }

  /**
   * Builds the cache key for one request.
   *
   * @remarks
   * The account's data version is part of the key. Invalidation is therefore an
   * increment that makes every previous entry for that account unreachable, rather
   * than a search for the keys that need deleting.
   *
   * @param userId - The authenticated caller.
   * @param shape - Which endpoint the entry belongs to.
   * @param query - The request, whose every filter has to be in the key.
   * @param policy - The missing actual policy, which changes the answer.
   * @returns The key.
   */
  private buildKey(userId: Types.ObjectId, shape: string, query: SeriesQueryDTO, policy: MissingActualPolicyEnum): string {
    const paged = query as ReportQueryDTO;
    const categoryIds = [...(query.categoryIds ?? [])].sort().join(',');

    return [
      userId.toString(),
      this.dataVersionService.current(userId),
      shape,
      query.from,
      query.to,
      categoryIds,
      policy,
      paged.limit ?? '',
      paged.offset ?? '',
    ].join('|');
  }

  /**
   * Reads a cached answer, if there is a live one.
   *
   * @typeParam TValue - The response type stored under this key.
   * @param key - The cache key.
   * @returns The cached response, or null.
   */
  private readCache<TValue>(key: string): TValue | null {
    const entry = this.cache.get(key);

    if (entry === undefined) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);

      return null;
    }

    // Re-inserting moves the key to the end of the Map's insertion order, which
    // is what makes the eviction below least recently used rather than oldest.
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value as TValue;
  }

  /**
   * Stores an answer, evicting the least recently used when the cache is full.
   *
   * @param key - The cache key.
   * @param value - The response to store.
   */
  private writeCache(key: string, value: unknown): void {
    if (this.cache.size >= REPORT_CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next();

      if (!oldest.done) {
        this.cache.delete(oldest.value);
      }
    }

    this.cache.set(key, { value, expiresAt: Date.now() + REPORT_CACHE_TTL_MS });
  }
}
