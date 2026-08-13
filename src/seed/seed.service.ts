import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { addMonths } from '@common/month';
import { AuthService } from '@modules/auth';
import { CategoriesService } from '@modules/categories';
import { ExpensesService } from '@modules/expenses';
import { PeriodLocksService } from '@modules/period-locks';
import { PlansService } from '@modules/plans';
import { UsersService } from '@modules/users';
import {
  DEMO_EXPENSE_COUNT,
  DEMO_FIRST_MONTH,
  DEMO_LOCKED_QUARTER,
  DEMO_MONTH_COUNT,
  DEMO_PLANNED_CATEGORIES,
  DEMO_UNPLANNED_CATEGORIES,
  SEED_EMAIL,
  SEED_PASSWORD,
  SPEC_ROWS,
} from './seed.constants';
import { deterministicRandom, pick, roundToMajor } from './seed.util';

/**
 * Fills a database with data worth looking at.
 *
 * @remarks
 * Two seeders with different jobs. `spec` writes exactly the published sample
 * table so a reviewer can run one command and check the report against numbers
 * they already have. `demo` writes a year of varied data so the report, the
 * chart, and the drill down have something to show.
 *
 * Both go through the normal services rather than writing to collections
 * directly. That is slower and it is the point: seeded data passes the same
 * validation, gets the same audit entries, and respects the same locks as data a
 * user creates, so a seeded database is a realistic one rather than a shape the
 * application could never have produced.
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly categoriesService: CategoriesService,
    private readonly plansService: PlansService,
    private readonly expensesService: ExpensesService,
    private readonly periodLocksService: PeriodLocksService,
  ) {}

  /**
   * Writes exactly the published sample table.
   *
   * @remarks
   * The point of this seeder is that its output is checkable against a table the
   * reader already has. It writes nothing else, so nothing else can be mistaken
   * for part of the sample.
   *
   * @steps
   * 1. Find or create the seed account.
   * 2. Set each target from the sample table.
   * 3. Log each amount that was actually spent, leaving February marketing empty
   *    because that is what the table says.
   *
   * @returns The account the data belongs to.
   */
  async seedSpec(): Promise<Types.ObjectId> {
    const userId = await this.ensureAccount();

    for (const row of SPEC_ROWS) {
      const categoryId = await this.ensureCategory(userId, row.category);

      await this.plansService.upsert(userId, {
        categoryId,
        month: row.month,
        targetMinor: row.planMinor,
      });

      if (row.spentMinor !== null) {
        await this.expensesService.create(userId, {
          categoryId,
          month: row.month,
          amountMinor: row.spentMinor,
        });
      }
    }

    this.logger.log({ rows: SPEC_ROWS.length }, 'sample table seeded');

    return userId;
  }

  /**
   * Writes a year of varied data.
   *
   * @remarks
   * Deliberately mixed, so the report shows every case rather than a column of
   * near misses: months over plan, under plan, exactly on plan, planned with
   * nothing spent, and spend against categories with no plan at all. One quarter
   * is closed, so a reviewer can watch an edit be rejected.
   *
   * Every number comes from a seeded generator, so two runs produce identical
   * data and a screenshot taken today still matches next week.
   *
   * @steps
   * 1. Find or create the seed account.
   * 2. Set a target for each planned category in each month.
   * 3. Log expenses spread across the year, some deliberately absent and some
   *    against unplanned categories.
   * 4. Close a quarter, last, so the writes above are not rejected by it.
   *
   * @returns The account the data belongs to.
   */
  async seedDemo(): Promise<Types.ObjectId> {
    const userId = await this.ensureAccount();
    const months = Array.from({ length: DEMO_MONTH_COUNT }, (_value: unknown, index: number) =>
      addMonths(DEMO_FIRST_MONTH, index),
    );

    const planned = await this.resolveCategories(userId, DEMO_PLANNED_CATEGORIES);
    const unplanned = await this.resolveCategories(userId, DEMO_UNPLANNED_CATEGORIES);
    const random = deterministicRandom(20_260_101);

    for (const month of months) {
      for (const category of planned) {
        await this.plansService.upsert(userId, {
          categoryId: category.id,
          month,
          targetMinor: roundToMajor(category.baseMinor),
        });
      }
    }

    const spendable = [...planned, ...unplanned];

    for (let index = 0; index < DEMO_EXPENSE_COUNT; index += 1) {
      const month = pick(months, random());
      const category = pick(spendable, random());

      // Between 70% and 130% of the category's usual monthly spend, which puts
      // rows on both sides of their target rather than clustering under it.
      const variation = 0.7 + random() * 0.6;

      await this.expensesService.create(userId, {
        categoryId: category.id,
        month,
        amountMinor: roundToMajor(category.baseMinor * variation),
        note: `Seeded entry ${index + 1}`,
      });
    }

    // Last, so everything above is written into open periods. Closing first would
    // make the seeder reject its own data.
    await this.periodLocksService.lock(userId, { quarter: DEMO_LOCKED_QUARTER });

    this.logger.log(
      { months: months.length, expenses: DEMO_EXPENSE_COUNT, lockedQuarter: DEMO_LOCKED_QUARTER },
      'demo data seeded',
    );

    return userId;
  }

  /**
   * Finds a category by name, creating it on the account when the catalogue has
   * no such name.
   *
   * @remarks
   * The sample table names `Marketing` and `Payroll`, while the shared catalogue
   * breaks spending down further into `Advertising` and `Salaries`. Rather than
   * bend the sample to fit the catalogue, which would stop a reader checking it
   * against the table they have, the two names are created as ordinary
   * account-owned categories: exactly what a user would do.
   *
   * @param userId - The seed account.
   * @param name - The category name.
   * @returns The category identifier.
   */
  private async ensureCategory(userId: Types.ObjectId, name: string): Promise<string> {
    const existing = await this.categoriesService.resolveByName(userId, name);

    if (existing !== null) {
      return existing._id.toString();
    }

    const created = await this.categoriesService.create(userId, { name });

    return created._id.toString();
  }

  /**
   * Finds the seed account, creating it the first time.
   *
   * @remarks
   * Idempotent, so a seeder can be run twice without a duplicate account or a
   * conflict. The data itself is not: running the demo seeder twice writes two
   * hundred expenses, because expenses are line items and appending is what
   * logging spend means.
   *
   * @returns The account identifier.
   */
  private async ensureAccount(): Promise<Types.ObjectId> {
    const existing = await this.usersService.findByEmail(SEED_EMAIL);

    if (existing !== null) {
      return existing._id;
    }

    const created = await this.authService.signup({ email: SEED_EMAIL, password: SEED_PASSWORD });

    this.logger.log({ email: SEED_EMAIL }, 'seed account created');

    return new Types.ObjectId(created.user.id);
  }

  /**
   * Resolves category names and assigns each a plausible monthly amount.
   *
   * @remarks
   * The amounts are shaped rather than uniform: payroll dwarfs stationery in a
   * real business, and a demo where every category costs about the same makes the
   * chart useless.
   *
   * @param userId - The seed account.
   * @param names - The category names to resolve.
   * @returns Each category's identifier and its usual monthly spend.
   * @throws Error When the shared catalogue is missing one of them.
   */
  private async resolveCategories(userId: Types.ObjectId, names: string[]): Promise<{ id: string; baseMinor: number }[]> {
    const resolved: { id: string; baseMinor: number }[] = [];
    const random = deterministicRandom(1_009);

    for (const name of names) {
      const category = await this.categoriesService.resolveByName(userId, name);

      if (category === null) {
        throw new Error(`The shared catalogue has no "${name}" category.`);
      }

      // Payroll is the largest line in most businesses by a wide margin, so it is
      // given one rather than being left to the generator.
      const baseMinor = name === 'Payroll' ? 4_500_000 : 50_000 + Math.floor(random() * 750_000);

      resolved.push({ id: category._id.toString(), baseMinor });
    }

    return resolved;
  }
}
