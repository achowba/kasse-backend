import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { bootstrapNestServer } from '../src/bootstrap';

/**
 * One row of the report, narrowed from supertest's untyped body.
 *
 * @property categoryId - The category.
 * @property categoryName - Its name, resolved by the aggregation.
 * @property month - The month.
 * @property planMinor - The target.
 * @property actualMinor - Logged spend, or null under the null policy.
 * @property varianceMinor - Actual minus plan.
 * @property variancePercent - The variance as a percentage of the plan.
 * @property hasPlan - Whether a target exists.
 * @property hasActual - Whether anything was logged.
 */
interface IReportRow {
  categoryId: string;
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
 * The report response, narrowed from supertest's untyped body.
 *
 * @property items - The rows on this page.
 * @property totals - Both sides summed across the range.
 * @property pagination - Where this page sits in the result set.
 */
interface IReportBody {
  items: IReportRow[];
  totals: { planMinor: number; actualMinor: number; varianceMinor: number; variancePercent: number | null };
  pagination: { limit: number; offset: number; total: number };
}

/**
 * The report, end to end against a real MongoDB.
 *
 * @remarks
 * The aggregation is the one part of this system that unit tests cannot reach.
 * `$unionWith`, `$facet`, `$group` over booleans, and the category `$lookup` are
 * database behaviour, and mocking the repository would assert only that the
 * service passes arguments along. These tests write real documents and read the
 * published sample table back out.
 */
describe('Reports (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let marketingId: string;
  let payrollId: string;

  const auth = (): string => `Bearer ${accessToken}`;
  const server = (): Server => app.getHttpServer() as Server;

  /**
   * Creates a category owned by the test account.
   *
   * @param name - The category name.
   * @returns Its identifier.
   */
  const createCategory = async (name: string): Promise<string> => {
    const response = await request(server()).post('/api/v1/categories').set('Authorization', auth()).send({ name }).expect(201);

    return (response.body as { id: string }).id;
  };

  /**
   * Sets the target for one category and month.
   *
   * @param categoryId - The category.
   * @param month - The month.
   * @param targetMinor - The target, in minor units.
   */
  const setPlan = async (categoryId: string, month: string, targetMinor: number): Promise<void> => {
    await request(server())
      .put('/api/v1/plans')
      .set('Authorization', auth())
      .send({ categoryId, month, targetMinor })
      .expect(200);
  };

  /**
   * Logs an expense.
   *
   * @param categoryId - The category.
   * @param month - The month.
   * @param amountMinor - The amount, in minor units.
   */
  const logExpense = async (categoryId: string, month: string, amountMinor: number): Promise<void> => {
    await request(server())
      .post('/api/v1/expenses')
      .set('Authorization', auth())
      .send({ categoryId, month, amountMinor })
      .expect(201);
  };

  /**
   * Reads the report.
   *
   * @param queryString - The query string, without the leading `?`.
   * @returns The report body.
   */
  const readReport = async (queryString: string): Promise<IReportBody> => {
    const response = await request(server())
      .get(`/api/v1/reports/plan-vs-actual?${queryString}`)
      .set('Authorization', auth())
      .expect(200);

    return response.body as IReportBody;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    bootstrapNestServer(app);
    await app.init();

    const signup = await request(server())
      .post('/api/v1/auth/signup')
      .send({ email: `reports-${Date.now()}@example.com`, password: 'a-long-enough-password' })
      .expect(201);

    accessToken = (signup.body as { accessToken: string }).accessToken;

    marketingId = await createCategory('Marketing');
    payrollId = await createCategory('Payroll');

    // The published sample data. February marketing is planned and never spent,
    // which is the case the missing actual policy exists for.
    await setPlan(marketingId, '2026-01', 500_000);
    await setPlan(payrollId, '2026-01', 2_000_000);
    await setPlan(marketingId, '2026-02', 500_000);
    await setPlan(payrollId, '2026-02', 2_000_000);

    await logExpense(marketingId, '2026-01', 480_000);
    await logExpense(payrollId, '2026-01', 2_050_000);
    await logExpense(payrollId, '2026-02', 1_980_000);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('the published sample table', () => {
    it('returns every row with the variance the table publishes', async () => {
      const report = await readReport('from=2026-01&to=2026-02');

      expect(report.items).toHaveLength(4);
      expect(
        report.items.map((row: IReportRow) => [row.month, row.categoryName, row.varianceMinor, row.variancePercent]),
      ).toEqual([
        ['2026-01', 'Marketing', -20_000, -4],
        ['2026-01', 'Payroll', 50_000, 2.5],
        ['2026-02', 'Marketing', -500_000, -100],
        ['2026-02', 'Payroll', -20_000, -1],
      ]);
    });

    it('resolves category names in the aggregation, so a client needs no second request', async () => {
      const report = await readReport('from=2026-01&to=2026-01');

      expect(report.items.map((row: IReportRow) => row.categoryName).sort()).toEqual(['Marketing', 'Payroll']);
    });

    it('renders the month with nothing logged as a dash under the null policy', async () => {
      const report = await readReport('from=2026-02&to=2026-02&missingActuals=null');
      const marketing = report.items.find((row: IReportRow) => row.categoryName === 'Marketing');

      expect(marketing).toEqual(
        expect.objectContaining({ actualMinor: null, varianceMinor: null, variancePercent: null, hasActual: false }),
      );
    });
  });

  describe('summing many expenses into one cell', () => {
    it('adds every expense logged against a category and month', async () => {
      const softwareId = await createCategory('Software');

      await setPlan(softwareId, '2026-05', 100_000);
      await logExpense(softwareId, '2026-05', 30_000);
      await logExpense(softwareId, '2026-05', 45_000);
      await logExpense(softwareId, '2026-05', 25_000);

      const report = await readReport('from=2026-05&to=2026-05');
      const software = report.items.find((row: IReportRow) => row.categoryName === 'Software');

      // Three line items, one row. This is the difference from a plan, and it is
      // why logging spend twice is not an overwrite.
      expect(software?.actualMinor).toBe(100_000);
      expect(software?.varianceMinor).toBe(0);
      expect(software?.variancePercent).toBe(0);
    });

    it('nets a refund off the month it belongs to', async () => {
      const travelId = await createCategory('Travel');

      await setPlan(travelId, '2026-06', 200_000);
      await logExpense(travelId, '2026-06', 250_000);
      await logExpense(travelId, '2026-06', -50_000);

      const report = await readReport('from=2026-06&to=2026-06');
      const travel = report.items.find((row: IReportRow) => row.categoryName === 'Travel');

      expect(travel?.actualMinor).toBe(200_000);
      expect(travel?.varianceMinor).toBe(0);
    });
  });

  describe('the cases a naive implementation gets wrong', () => {
    it('keeps a category that has spend but no plan, which a lookup from the plan side would drop', async () => {
      const legalId = await createCategory('Legal');

      await logExpense(legalId, '2026-07', 90_000);

      const report = await readReport('from=2026-07&to=2026-07');
      const legal = report.items.find((row: IReportRow) => row.categoryName === 'Legal');

      // Unplanned spend is the most interesting row in a variance report, and a
      // join from the plan side never sees it.
      expect(legal).toBeDefined();
      expect(legal?.hasPlan).toBe(false);
      expect(legal?.planMinor).toBe(0);
      expect(legal?.varianceMinor).toBe(90_000);
    });

    it('reports a null percentage against a plan of zero rather than NaN or Infinity', async () => {
      const eventsId = await createCategory('Events');

      await setPlan(eventsId, '2026-08', 0);
      await logExpense(eventsId, '2026-08', 75_000);

      const report = await readReport('from=2026-08&to=2026-08');
      const events = report.items.find((row: IReportRow) => row.categoryName === 'Events');

      expect(events?.hasPlan).toBe(true);
      expect(events?.varianceMinor).toBe(75_000);
      expect(events?.variancePercent).toBeNull();
    });

    it('distinguishes an expense of zero from no expense at all', async () => {
      const trainingId = await createCategory('Training');

      await setPlan(trainingId, '2026-09', 50_000);
      await setPlan(trainingId, '2026-10', 50_000);
      await logExpense(trainingId, '2026-09', 0);

      const report = await readReport('from=2026-09&to=2026-10&missingActuals=null');
      const logged = report.items.find((row: IReportRow) => row.month === '2026-09');
      const never = report.items.find((row: IReportRow) => row.month === '2026-10');

      // Both sum to zero. Only hasActual separates "we spent nothing and said so"
      // from "nobody has told us yet".
      expect(logged?.hasActual).toBe(true);
      expect(logged?.actualMinor).toBe(0);
      expect(never?.hasActual).toBe(false);
      expect(never?.actualMinor).toBeNull();
    });

    it('excludes a soft deleted expense, which the aggregation has to filter for itself', async () => {
      const cloudId = await createCategory('Cloud');

      await setPlan(cloudId, '2026-11', 100_000);
      await logExpense(cloudId, '2026-11', 40_000);

      const listed = await request(server())
        .get(`/api/v1/expenses?from=2026-11&to=2026-11&categoryId=${cloudId}`)
        .set('Authorization', auth())
        .expect(200);
      const expenseId = (listed.body as { items: { id: string }[] }).items[0]?.id;

      await request(server()).delete(`/api/v1/expenses/${expenseId}`).set('Authorization', auth()).expect(204);

      const report = await readReport('from=2026-11&to=2026-11');
      const cloud = report.items.find((row: IReportRow) => row.categoryName === 'Cloud');

      // The base repository applies the soft delete filter everywhere else. An
      // aggregation bypasses it entirely, so omitting deletedAt from the pipeline
      // would resurrect deleted rows in reports and nowhere else.
      expect(cloud?.actualMinor).toBe(0);
      expect(cloud?.hasActual).toBe(false);
    });
  });

  describe('totals and paging', () => {
    it('computes totals over the whole range while returning one page', async () => {
      const page = await readReport('from=2026-01&to=2026-02&limit=2&offset=0');

      expect(page.items).toHaveLength(2);
      expect(page.pagination.total).toBe(4);

      // The summary describes the range, not the page. It has to match what the
      // unpaginated read reports, or a reader turning a page sees the totals move.
      const whole = await readReport('from=2026-01&to=2026-02');

      expect(page.totals).toEqual(whole.totals);
      expect(page.totals.planMinor).toBe(5_000_000);
      expect(page.totals.actualMinor).toBe(4_510_000);
    });

    it('pages without repeating or skipping a row', async () => {
      const first = await readReport('from=2026-01&to=2026-02&limit=2&offset=0');
      const second = await readReport('from=2026-01&to=2026-02&limit=2&offset=2');
      const keys = [...first.items, ...second.items].map((row: IReportRow) => `${row.month}:${row.categoryName}`);

      expect(new Set(keys).size).toBe(4);
    });
  });

  describe('filtering and validation', () => {
    it('restricts the report to the categories asked for', async () => {
      const report = await readReport(`from=2026-01&to=2026-02&categoryIds=${marketingId}`);

      expect(report.items).toHaveLength(2);
      expect(report.items.every((row: IReportRow) => row.categoryId === marketingId)).toBe(true);
    });

    it('rejects a range that ends before it starts', async () => {
      await request(server())
        .get('/api/v1/reports/plan-vs-actual?from=2026-06&to=2026-01')
        .set('Authorization', auth())
        .expect(400);
    });

    it('rejects a malformed month', async () => {
      await request(server())
        .get('/api/v1/reports/plan-vs-actual?from=2026-6&to=2026-08')
        .set('Authorization', auth())
        .expect(400);
    });

    it('refuses an unauthenticated read', async () => {
      await request(server()).get('/api/v1/reports/plan-vs-actual?from=2026-01&to=2026-02').expect(401);
    });

    it('never shows one account another account’s numbers', async () => {
      const other = await request(server())
        .post('/api/v1/auth/signup')
        .send({ email: `outsider-${Date.now()}@example.com`, password: 'a-long-enough-password' })
        .expect(201);
      const otherToken = (other.body as { accessToken: string }).accessToken;

      const response = await request(server())
        .get('/api/v1/reports/plan-vs-actual?from=2026-01&to=2026-02')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);

      expect((response.body as IReportBody).items).toEqual([]);
    });
  });

  describe('the chart series', () => {
    it('sums each month across every category', async () => {
      const response = await request(server())
        .get('/api/v1/reports/plan-vs-actual/series?from=2026-01&to=2026-02&groupBy=month')
        .set('Authorization', auth())
        .expect(200);
      const body = response.body as { points: { key: string; planMinor: number; actualMinor: number }[] };

      expect(body.points.map((point) => point.key)).toEqual(['2026-01', '2026-02']);
      expect(body.points[0]?.actualMinor).toBe(2_530_000);
      expect(body.points[1]?.actualMinor).toBe(1_980_000);
    });

    it('agrees with the table it sits beside', async () => {
      const table = await readReport('from=2026-01&to=2026-02');
      const response = await request(server())
        .get('/api/v1/reports/plan-vs-actual/series?from=2026-01&to=2026-02&groupBy=month')
        .set('Authorization', auth())
        .expect(200);
      const body = response.body as { points: { planMinor: number; actualMinor: number }[] };
      const seriesTotal = body.points.reduce((sum: number, point) => sum + point.actualMinor, 0);

      // Both come from the same pipeline. If they ever disagree, one of them has
      // grown a second implementation.
      expect(seriesTotal).toBe(table.totals.actualMinor);
    });

    it('groups by category when asked', async () => {
      const response = await request(server())
        .get('/api/v1/reports/plan-vs-actual/series?from=2026-01&to=2026-02&groupBy=category')
        .set('Authorization', auth())
        .expect(200);
      const body = response.body as { points: { label: string }[] };

      expect(body.points.map((point) => point.label)).toEqual(['Marketing', 'Payroll']);
    });
  });

  describe('cache invalidation', () => {
    it('reflects a new expense immediately rather than serving a cached report', async () => {
      const suppliesId = await createCategory('Supplies');

      await setPlan(suppliesId, '2026-12', 100_000);

      const before = await readReport('from=2026-12&to=2026-12');

      expect(before.items[0]?.actualMinor).toBe(0);

      await logExpense(suppliesId, '2026-12', 60_000);

      const after = await readReport('from=2026-12&to=2026-12');

      // The first read populated the cache. A write bumps the account's data
      // version, which makes that entry unreachable rather than merely stale.
      expect(after.items[0]?.actualMinor).toBe(60_000);
    });
  });
});
