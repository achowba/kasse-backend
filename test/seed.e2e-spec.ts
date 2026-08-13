import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AppModule } from '../src/app.module';
import { ExpensesService } from '../src/modules/expenses';
import { PeriodLockedException, PeriodLocksService } from '../src/modules/period-locks';
import { PlansService } from '../src/modules/plans';
import { ReportsService } from '../src/modules/reports';
import { DEMO_EXPENSE_COUNT, DEMO_LOCKED_QUARTER } from '../src/seed/seed.constants';
import { SeedModule } from '../src/seed/seed.module';
import { SeedService } from '../src/seed/seed.service';

/**
 * The seeders, run for real against a database.
 *
 * @remarks
 * The spec seeder exists so a reviewer can check the report against numbers they
 * already have, which is only worth anything if it actually produces them. This
 * asserts exactly that, and is the automated form of the manual verification step
 * in the plan.
 */
describe('Seeders (e2e)', () => {
  let app: INestApplication;
  let seedService: SeedService;
  let reportsService: ReportsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, SeedModule] }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    seedService = app.get(SeedService);
    reportsService = app.get(ReportsService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('the spec seeder', () => {
    let userId: Types.ObjectId;

    beforeAll(async () => {
      userId = await seedService.seedSpec();
    });

    it('produces the published sample table exactly', async () => {
      const report = await reportsService.planVsActual(userId, { from: '2026-01', to: '2026-02', limit: 50, offset: 0 });

      expect(
        report.items.map((row) => [
          row.month,
          row.categoryName,
          row.planMinor,
          row.actualMinor,
          row.varianceMinor,
          row.variancePercent,
        ]),
      ).toEqual([
        ['2026-01', 'Marketing', 500_000, 480_000, -20_000, -4],
        ['2026-01', 'Payroll', 2_000_000, 2_050_000, 50_000, 2.5],
        ['2026-02', 'Marketing', 500_000, 0, -500_000, -100],
        ['2026-02', 'Payroll', 2_000_000, 1_980_000, -20_000, -1],
      ]);
    });

    it('leaves February marketing genuinely unlogged, not logged as zero', async () => {
      const report = await reportsService.planVsActual(userId, {
        from: '2026-02',
        to: '2026-02',
        limit: 50,
        offset: 0,
      });
      const marketing = report.items.find((row) => row.categoryName === 'Marketing');

      // The distinction the whole missing actual policy rests on. If the seeder
      // had written a zero expense here, the sample table would still look right
      // while the flag underneath it was wrong.
      expect(marketing?.hasActual).toBe(false);
      expect(marketing?.hasPlan).toBe(true);
    });

    it('writes nothing beyond the sample table, so nothing else can be mistaken for it', async () => {
      const report = await reportsService.planVsActual(userId, { from: '2020-01', to: '2030-12', limit: 200, offset: 0 });

      expect(report.pagination.total).toBe(4);
    });

    it('can be run twice without changing the targets', async () => {
      await seedService.seedSpec();

      const report = await reportsService.planVsActual(userId, { from: '2026-01', to: '2026-01', limit: 50, offset: 0 });
      const marketing = report.items.find((row) => row.categoryName === 'Marketing');

      // A plan is a cell, so re-seeding overwrites it rather than duplicating it.
      // The expenses do double, which is correct: they are line items.
      expect(marketing?.planMinor).toBe(500_000);
    });
  });

  describe('the demo seeder', () => {
    let userId: Types.ObjectId;

    beforeAll(async () => {
      userId = await seedService.seedDemo();
    });

    it('writes the expected number of expenses across a year', async () => {
      const expensesService = app.get(ExpensesService);
      const listed = await expensesService.list(userId, { from: '2026-01', to: '2026-12', limit: 500, offset: 0 });

      expect(listed.pagination.total).toBeGreaterThanOrEqual(DEMO_EXPENSE_COUNT);
    });

    it('produces spend on both sides of plan rather than a column of near misses', async () => {
      const report = await reportsService.planVsActual(userId, { from: '2026-01', to: '2026-12', limit: 500, offset: 0 });
      const over = report.items.filter((row) => (row.varianceMinor ?? 0) > 0);
      const under = report.items.filter((row) => (row.varianceMinor ?? 0) < 0);

      expect(over.length).toBeGreaterThan(0);
      expect(under.length).toBeGreaterThan(0);
    });

    it('includes spend against categories with no plan, which a naive report would drop', async () => {
      const report = await reportsService.planVsActual(userId, { from: '2026-01', to: '2026-12', limit: 500, offset: 0 });
      const unplanned = report.items.filter((row) => !row.hasPlan && row.hasActual);

      expect(unplanned.length).toBeGreaterThan(0);
    });

    it('closes a quarter, so a reviewer can watch an edit be rejected', async () => {
      const periodLocks = app.get(PeriodLocksService);
      const plansService = app.get(PlansService);
      const report = await reportsService.planVsActual(userId, { from: '2026-01', to: '2026-01', limit: 1, offset: 0 });
      const categoryId = report.items[0]?.categoryId ?? '';

      await expect(periodLocks.assertUnlocked(userId, '2026-01')).rejects.toBeInstanceOf(PeriodLockedException);
      await expect(plansService.upsert(userId, { categoryId, month: '2026-01', targetMinor: 1 })).rejects.toBeInstanceOf(
        PeriodLockedException,
      );
      expect(DEMO_LOCKED_QUARTER).toBe('2026-Q1');
    });

    it('is deterministic, so two runs of the report agree', async () => {
      const first = await reportsService.planVsActual(userId, { from: '2026-06', to: '2026-06', limit: 50, offset: 0 });
      const second = await reportsService.planVsActual(userId, { from: '2026-06', to: '2026-06', limit: 50, offset: 0 });

      expect(first.totals).toEqual(second.totals);
    });
  });
});
