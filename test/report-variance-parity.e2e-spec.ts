import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AppModule } from '../src/app.module';
import { calculateVariance, MissingActualPolicyEnum } from '../src/common/money';
import { AuthService } from '../src/modules/auth';
import { CategoriesService } from '../src/modules/categories';
import { ExpensesService } from '../src/modules/expenses';
import { PlansService } from '../src/modules/plans';
import { ReportsRepository } from '../src/modules/reports';

/**
 * One case to put through both implementations.
 *
 * @property name - What the case is, so a failure names itself.
 * @property planMinor - The target.
 * @property expenses - The amounts logged, empty for a month nobody reported on.
 */
interface IParityCase {
  name: string;
  planMinor: number;
  expenses: number[];
}

/**
 * The matrix, chosen for the cases where two implementations drift apart.
 *
 * @remarks
 * The rounding cases are the point. A percentage lands on an exact half whenever
 * the variance over the plan hits the right ratio, and that is where MongoDB's
 * `$round` and JavaScript's `Math.round` disagree: `$round` breaks a tie to even,
 * `Math.round` breaks it toward positive infinity. The pipeline reproduces
 * `Math.round` rather than using `$round`, and these cases are what proves it.
 */
const CASES: IParityCase[] = [
  { name: 'the published Marketing row', planMinor: 500_000, expenses: [480_000] },
  { name: 'the published Payroll row, over plan', planMinor: 2_000_000, expenses: [2_050_000] },
  { name: 'exactly on plan', planMinor: 100_000, expenses: [100_000] },
  { name: 'a plan of zero with spend against it', planMinor: 0, expenses: [125_000] },
  { name: 'a plan of zero with nothing logged', planMinor: 0, expenses: [] },
  { name: 'a plan with nothing logged', planMinor: 500_000, expenses: [] },
  { name: 'a logged zero, which is not the same as nothing logged', planMinor: 500_000, expenses: [0] },
  { name: 'several expenses summing into one cell', planMinor: 100_000, expenses: [30_000, 45_000, 25_000] },
  { name: 'a refund taking the actual negative', planMinor: 100_000, expenses: [20_000, -50_000] },
  { name: 'spend far over plan', planMinor: 1_000, expenses: [1_000_000] },
  { name: 'a positive exact half percent, 2.125', planMinor: 800_000, expenses: [817_000] },
  { name: 'a negative exact half percent, -2.125', planMinor: 800_000, expenses: [783_000] },
  { name: 'a recurring percentage, one third', planMinor: 300_000, expenses: [400_000] },
  { name: 'a percentage needing both decimal places', planMinor: 700_000, expenses: [712_345] },
  { name: 'one minor unit under plan', planMinor: 1_000_000, expenses: [999_999] },
  { name: 'one minor unit over plan', planMinor: 1_000_000, expenses: [1_000_001] },
];

/**
 * The aggregation's arithmetic against the function that defines it.
 *
 * @remarks
 * Variance moved into an `$addFields` stage so the database does the sums, but
 * `calculateVariance` remains the specification: exhaustively unit tested,
 * readable, and the thing the assignment's numbers were checked against.
 *
 * Two implementations of the same graded arithmetic will drift unless something
 * holds them together. This is that something. It writes real data, reads it back
 * through the real pipeline, and asserts the database agrees with the function on
 * every case, under both missing actual policies.
 */
describe('Report variance parity (e2e)', () => {
  let app: INestApplication;
  let repository: ReportsRepository;
  let userId: Types.ObjectId;
  const categoryIds = new Map<string, Types.ObjectId>();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    repository = app.get(ReportsRepository);

    const auth = app.get(AuthService);
    const categories = app.get(CategoriesService);
    const plans = app.get(PlansService);
    const expenses = app.get(ExpensesService);

    const account = await auth.signup({ email: `parity-${Date.now()}@example.com`, password: 'a-long-enough-password' });

    userId = new Types.ObjectId(account.user.id);

    // One category and one month per case, so cases cannot contaminate each
    // other and a failure points at exactly one row.
    for (const [index, testCase] of CASES.entries()) {
      const month = `21${String(index).padStart(2, '0')}-01`;
      const category = await categories.create(userId, { name: `Parity ${index}` });

      categoryIds.set(testCase.name, category._id);

      await plans.upsert(userId, {
        categoryId: category._id.toString(),
        month,
        targetMinor: testCase.planMinor,
      });

      for (const amountMinor of testCase.expenses) {
        await expenses.create(userId, { categoryId: category._id.toString(), month, amountMinor });
      }
    }
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Reads one case's row back through the real pipeline.
   *
   * @param index - The case's position, which fixes its month.
   * @param policy - The policy to aggregate under.
   * @returns The computed cell.
   */
  const readCell = async (
    index: number,
    policy: MissingActualPolicyEnum,
  ): Promise<{
    planMinor: number;
    actualMinor: number | null;
    varianceMinor: number | null;
    variancePercent: number | null;
    hasActual: boolean;
  }> => {
    const month = `21${String(index).padStart(2, '0')}-01`;
    const { cells } = await repository.aggregate(userId, month, month, [], 50, 0, policy);
    const cell = cells[0];

    if (cell === undefined) {
      throw new Error(`No row came back for ${month}.`);
    }

    return cell;
  };

  describe.each([MissingActualPolicyEnum.ZERO, MissingActualPolicyEnum.NULL])('under the %s policy', (policy) => {
    it.each(CASES.map((testCase, index): [string, IParityCase, number] => [testCase.name, testCase, index]))(
      'agrees with calculateVariance on %s',
      async (_name: string, testCase: IParityCase, index: number) => {
        const cell = await readCell(index, policy);
        const loggedTotal = testCase.expenses.reduce((sum: number, amount: number) => sum + amount, 0);
        const expected = calculateVariance(testCase.planMinor, testCase.expenses.length > 0 ? loggedTotal : null, policy);

        expect({
          actualMinor: cell.actualMinor,
          varianceMinor: cell.varianceMinor,
          variancePercent: cell.variancePercent,
        }).toEqual({
          actualMinor: expected.actualMinor,
          varianceMinor: expected.varianceMinor,
          variancePercent: expected.variancePercent,
        });
      },
    );
  });

  it('never produces NaN or Infinity, whatever the plan', async () => {
    for (const [index] of CASES.entries()) {
      const cell = await readCell(index, MissingActualPolicyEnum.ZERO);

      // A plan of zero is in the matrix. Dividing by it in the pipeline would
      // either raise and fail the whole report or emit a value no client can
      // render, and both have happened in systems that skipped this guard.
      expect(Number.isFinite(cell.variancePercent ?? 0)).toBe(true);
      expect(Number.isNaN(cell.variancePercent ?? 0)).toBe(false);
    }
  });

  it('keeps the exact-half rounding the function chose, rather than the database default', async () => {
    const positiveHalf = CASES.findIndex((testCase) => testCase.name.includes('positive exact half'));
    const negativeHalf = CASES.findIndex((testCase) => testCase.name.includes('negative exact half'));

    const positive = await readCell(positiveHalf, MissingActualPolicyEnum.ZERO);
    const negative = await readCell(negativeHalf, MissingActualPolicyEnum.ZERO);

    // Half up, which is what Math.round does. MongoDB's $round would give 2.12
    // and -2.12 here by rounding to even; the pipeline uses $floor(x + 0.5)
    // precisely so it does not.
    expect(positive.variancePercent).toBe(2.13);
    expect(negative.variancePercent).toBe(-2.12);
  });
});
