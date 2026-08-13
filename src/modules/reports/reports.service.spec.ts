import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DataVersionService } from '@common/cache';
import { MissingActualPolicyEnum } from '@common/money';
import { UsersService } from '@modules/users';
import { ReportQueryDTO } from './dto/report-query.dto';
import { SeriesGroupByEnum } from './reports.enums';
import { IReportCell, ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

const marketing = new Types.ObjectId();
const payroll = new Types.ObjectId();

/** Stand in for one aggregated cell. */
const buildCell = (overrides: Partial<IReportCell> = {}): IReportCell => ({
  categoryId: marketing,
  categoryName: 'Marketing',
  month: '2026-01',
  planMinor: 500_000,
  actualMinor: 480_000,
  hasPlan: true,
  hasActual: true,
  ...overrides,
});

/**
 * The published sample data, as the aggregation would return it.
 *
 * @remarks
 * February marketing has a target and nothing logged, which is the case the
 * missing actual policy exists for.
 */
const sampleCells: IReportCell[] = [
  buildCell({ month: '2026-01', categoryId: marketing, categoryName: 'Marketing', planMinor: 500_000, actualMinor: 480_000 }),
  buildCell({ month: '2026-01', categoryId: payroll, categoryName: 'Payroll', planMinor: 2_000_000, actualMinor: 2_050_000 }),
  buildCell({
    month: '2026-02',
    categoryId: marketing,
    categoryName: 'Marketing',
    planMinor: 500_000,
    actualMinor: 0,
    hasActual: false,
  }),
  buildCell({ month: '2026-02', categoryId: payroll, categoryName: 'Payroll', planMinor: 2_000_000, actualMinor: 1_980_000 }),
];

describe('ReportsService', () => {
  const userId = new Types.ObjectId();
  let repository: jest.Mocked<Pick<ReportsRepository, 'aggregate' | 'series'>>;
  let dataVersion: DataVersionService;
  let users: jest.Mocked<Pick<UsersService, 'findById'>>;
  let service: ReportsService;

  const query = (overrides: Partial<ReportQueryDTO> = {}): ReportQueryDTO => ({
    from: '2026-01',
    to: '2026-02',
    limit: 50,
    offset: 0,
    ...overrides,
  });

  beforeEach(() => {
    repository = {
      aggregate: jest.fn().mockResolvedValue({
        cells: sampleCells,
        totals: { planMinor: 5_000_000, actualMinor: 4_510_000 },
        total: 4,
      }),
      series: jest.fn().mockResolvedValue([]),
    };

    // The real one. It holds nothing but a counter, and the cache behaviour under
    // test is precisely how the service and the counter interact.
    dataVersion = new DataVersionService();
    users = { findById: jest.fn().mockResolvedValue({ fiscalYearStartMonth: 1 }) };
    service = new ReportsService(repository as unknown as ReportsRepository, dataVersion, users as unknown as UsersService);
  });

  describe('the published sample table', () => {
    it('reproduces every row exactly', async () => {
      const report = await service.planVsActual(userId, query());

      expect(report.items).toEqual([
        expect.objectContaining({
          categoryName: 'Marketing',
          month: '2026-01',
          planMinor: 500_000,
          actualMinor: 480_000,
          varianceMinor: -20_000,
          variancePercent: -4,
        }),
        expect.objectContaining({
          categoryName: 'Payroll',
          month: '2026-01',
          planMinor: 2_000_000,
          actualMinor: 2_050_000,
          varianceMinor: 50_000,
          variancePercent: 2.5,
        }),
        expect.objectContaining({
          categoryName: 'Marketing',
          month: '2026-02',
          planMinor: 500_000,
          actualMinor: 0,
          varianceMinor: -500_000,
          variancePercent: -100,
        }),
        expect.objectContaining({
          categoryName: 'Payroll',
          month: '2026-02',
          planMinor: 2_000_000,
          actualMinor: 1_980_000,
          varianceMinor: -20_000,
          variancePercent: -1,
        }),
      ]);
    });

    it('reports the month with nothing logged as a dash under the null policy', async () => {
      const report = await service.planVsActual(userId, query({ missingActuals: MissingActualPolicyEnum.NULL }));

      expect(report.items[2]).toEqual(
        expect.objectContaining({
          month: '2026-02',
          categoryName: 'Marketing',
          planMinor: 500_000,
          actualMinor: null,
          varianceMinor: null,
          variancePercent: null,
          hasActual: false,
        }),
      );
    });

    it('leaves the months that were logged untouched by the policy', async () => {
      const report = await service.planVsActual(userId, query({ missingActuals: MissingActualPolicyEnum.NULL }));

      expect(report.items[0]).toEqual(expect.objectContaining({ actualMinor: 480_000, variancePercent: -4 }));
    });
  });

  describe('the edge cases the report is judged on', () => {
    it('reports a null percentage when the plan is zero, never NaN or Infinity', async () => {
      repository.aggregate.mockResolvedValue({
        cells: [buildCell({ planMinor: 0, actualMinor: 125_000, hasPlan: false })],
        totals: { planMinor: 0, actualMinor: 125_000 },
        total: 1,
      });

      const report = await service.planVsActual(userId, query());

      // The absolute variance is still the whole of the unplanned spend, which is
      // the number a reader needs. Only the percentage has no answer.
      expect(report.items[0]?.varianceMinor).toBe(125_000);
      expect(report.items[0]?.variancePercent).toBeNull();
      expect(report.totals.variancePercent).toBeNull();
    });

    it('distinguishes a logged zero from nothing logged', async () => {
      repository.aggregate.mockResolvedValue({
        cells: [
          buildCell({ month: '2026-01', actualMinor: 0, hasActual: true }),
          buildCell({ month: '2026-02', actualMinor: 0, hasActual: false }),
        ],
        totals: { planMinor: 1_000_000, actualMinor: 0 },
        total: 2,
      });

      const report = await service.planVsActual(userId, query({ missingActuals: MissingActualPolicyEnum.NULL }));

      // Both sum to zero. Only the flag separates "we spent nothing and recorded
      // that" from "nobody has told us yet", and deciding from the sum would
      // report them identically.
      expect(report.items[0]?.actualMinor).toBe(0);
      expect(report.items[1]?.actualMinor).toBeNull();
    });

    it('keeps a category that has spend but no plan', async () => {
      repository.aggregate.mockResolvedValue({
        cells: [buildCell({ categoryName: 'Legal', planMinor: 0, actualMinor: 90_000, hasPlan: false })],
        totals: { planMinor: 0, actualMinor: 90_000 },
        total: 1,
      });

      const report = await service.planVsActual(userId, query());

      expect(report.items[0]).toEqual(expect.objectContaining({ categoryName: 'Legal', hasPlan: false, varianceMinor: 90_000 }));
    });

    it('rejects a range that ends before it starts', async () => {
      await expect(service.planVsActual(userId, query({ from: '2026-06', to: '2026-01' }))).rejects.toBeInstanceOf(
        BadRequestException,
      );

      // Rejected rather than answered with an empty table, which would read as an
      // account with no data rather than as a mistyped request.
      expect(repository.aggregate).not.toHaveBeenCalled();
    });

    it('accepts a single month range', async () => {
      await expect(service.planVsActual(userId, query({ from: '2026-01', to: '2026-01' }))).resolves.toBeDefined();
    });

    it('returns zeroed totals for a range with nothing in it', async () => {
      repository.aggregate.mockResolvedValue({ cells: [], totals: { planMinor: 0, actualMinor: 0 }, total: 0 });

      const report = await service.planVsActual(userId, query());

      expect(report.items).toEqual([]);
      expect(report.totals).toEqual({ planMinor: 0, actualMinor: 0, varianceMinor: 0, variancePercent: null });
    });
  });

  describe('totals', () => {
    it('covers the whole range rather than the page', async () => {
      const report = await service.planVsActual(userId, query({ limit: 2, offset: 0 }));

      // The repository reported 5,000,000 planned across four rows while the page
      // holds two. A summary built from the page would change as the reader
      // paged, which is the bug the facet exists to prevent.
      expect(report.totals.planMinor).toBe(5_000_000);
      expect(report.totals.actualMinor).toBe(4_510_000);
      expect(report.totals.varianceMinor).toBe(-490_000);
      expect(report.pagination.total).toBe(4);
    });

    it('sums real amounts even when the rows show dashes', async () => {
      const report = await service.planVsActual(userId, query({ missingActuals: MissingActualPolicyEnum.NULL }));

      // A null in the middle of a column of money is not something a reader can
      // add up, so the summary stays numeric while the row that has nothing
      // logged still shows its dash.
      expect(report.totals.actualMinor).toBe(4_510_000);
      expect(report.items[2]?.actualMinor).toBeNull();
    });
  });

  describe('caching', () => {
    it('serves a repeated request without aggregating again', async () => {
      await service.planVsActual(userId, query());
      await service.planVsActual(userId, query());

      expect(repository.aggregate).toHaveBeenCalledTimes(1);
    });

    it('aggregates again once the account writes', async () => {
      await service.planVsActual(userId, query());
      dataVersion.bump(userId);
      await service.planVsActual(userId, query());

      expect(repository.aggregate).toHaveBeenCalledTimes(2);
    });

    it('does not serve one account a report built for another', async () => {
      const otherUserId = new Types.ObjectId();

      await service.planVsActual(userId, query());
      await service.planVsActual(otherUserId, query());

      expect(repository.aggregate).toHaveBeenCalledTimes(2);
    });

    it('treats a different policy as a different question', async () => {
      await service.planVsActual(userId, query({ missingActuals: MissingActualPolicyEnum.ZERO }));
      await service.planVsActual(userId, query({ missingActuals: MissingActualPolicyEnum.NULL }));

      expect(repository.aggregate).toHaveBeenCalledTimes(2);
    });

    it('treats a different page as a different question', async () => {
      await service.planVsActual(userId, query({ offset: 0 }));
      await service.planVsActual(userId, query({ offset: 50 }));

      expect(repository.aggregate).toHaveBeenCalledTimes(2);
    });

    it('is not confused by the order categories were requested in', async () => {
      const a = marketing.toString();
      const b = payroll.toString();

      await service.planVsActual(userId, query({ categoryIds: [a, b] }));
      await service.planVsActual(userId, query({ categoryIds: [b, a] }));

      expect(repository.aggregate).toHaveBeenCalledTimes(1);
    });
  });

  describe('fiscal year', () => {
    it('resolves a calendar fiscal year to January through December', async () => {
      users.findById.mockResolvedValue({ fiscalYearStartMonth: 1 } as never);

      await service.planVsActual(userId, { fiscalYear: 2026, limit: 50, offset: 0 });

      expect(repository.aggregate).toHaveBeenCalledWith(userId, '2026-01', '2026-12', [], 50, 0);
    });

    it('resolves an April start to the following March, crossing the calendar year', async () => {
      users.findById.mockResolvedValue({ fiscalYearStartMonth: 4 } as never);

      await service.planVsActual(userId, { fiscalYear: 2026, limit: 50, offset: 0 });

      // The end month is in 2027. Adding eleven months to April has to roll the
      // year over rather than producing month 15.
      expect(repository.aggregate).toHaveBeenCalledWith(userId, '2026-04', '2027-03', [], 50, 0);
    });

    it('resolves a December start to the following November', async () => {
      users.findById.mockResolvedValue({ fiscalYearStartMonth: 12 } as never);

      await service.planVsActual(userId, { fiscalYear: 2026, limit: 50, offset: 0 });

      expect(repository.aggregate).toHaveBeenCalledWith(userId, '2026-12', '2027-11', [], 50, 0);
    });

    it('takes precedence over from and to, so a request carrying both has one meaning', async () => {
      users.findById.mockResolvedValue({ fiscalYearStartMonth: 1 } as never);

      await service.planVsActual(userId, { fiscalYear: 2026, from: '2030-01', to: '2030-06', limit: 50, offset: 0 });

      expect(repository.aggregate).toHaveBeenCalledWith(userId, '2026-01', '2026-12', [], 50, 0);
    });

    it('keys the cache on the resolved months, so changing the start month needs no invalidation', async () => {
      users.findById.mockResolvedValue({ fiscalYearStartMonth: 1 } as never);
      await service.planVsActual(userId, { fiscalYear: 2026, limit: 50, offset: 0 });

      users.findById.mockResolvedValue({ fiscalYearStartMonth: 4 } as never);
      await service.planVsActual(userId, { fiscalYear: 2026, limit: 50, offset: 0 });

      // Same request, different answer, and no cache bump anywhere: the resolved
      // range is part of the key, so the second lookup simply misses.
      expect(repository.aggregate).toHaveBeenCalledTimes(2);
    });

    it('rejects a request naming no range at all', async () => {
      await expect(service.planVsActual(userId, { limit: 50, offset: 0 })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a half specified range', async () => {
      await expect(service.planVsActual(userId, { from: '2026-01', limit: 50, offset: 0 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('applies to the chart series too', async () => {
      users.findById.mockResolvedValue({ fiscalYearStartMonth: 7 } as never);

      await service.series(userId, { fiscalYear: 2026 });

      expect(repository.series).toHaveBeenCalledWith(userId, '2026-07', '2027-06', [], SeriesGroupByEnum.MONTH);
    });
  });

  describe('series', () => {
    it('carries the variance for each point', async () => {
      repository.series.mockResolvedValue([
        { key: '2026-01', label: '2026-01', planMinor: 2_500_000, actualMinor: 2_530_000 },
        { key: '2026-02', label: '2026-02', planMinor: 2_500_000, actualMinor: 1_980_000 },
      ]);

      const series = await service.series(userId, { from: '2026-01', to: '2026-02' });

      expect(series.groupBy).toBe(SeriesGroupByEnum.MONTH);
      expect(series.points[0]?.varianceMinor).toBe(30_000);
      expect(series.points[1]?.varianceMinor).toBe(-520_000);
    });

    it('rejects a backwards range like the table does', async () => {
      await expect(service.series(userId, { from: '2026-06', to: '2026-01' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('treats each axis as a different question', async () => {
      await service.series(userId, { from: '2026-01', to: '2026-02', groupBy: SeriesGroupByEnum.MONTH });
      await service.series(userId, { from: '2026-01', to: '2026-02', groupBy: SeriesGroupByEnum.CATEGORY });

      expect(repository.series).toHaveBeenCalledTimes(2);
    });
  });
});
