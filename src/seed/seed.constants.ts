/**
 * The account both seeders write to.
 *
 * @remarks
 * A fixed address so a reviewer can log in without being told a generated one,
 * and so re-running a seeder finds the same account rather than accumulating one
 * per run.
 */
export const SEED_EMAIL = 'demo@plan-vs-spend.app';

/**
 * The seed account's password.
 *
 * @remarks
 * Committed deliberately. It opens a local database of invented numbers and
 * nothing else. A deployment seeds nothing and this account does not exist there,
 * which is the only reason it is safe to write down.
 */
export const SEED_PASSWORD = 'demo-account-password';

/**
 * The published sample table.
 *
 * @remarks
 * The one piece of seed data that is not invented. Its two categories are created
 * on the account rather than resolved from the shared catalogue, which names
 * spending more specifically: `Salaries` and `Advertising` rather than `Payroll`
 * and `Marketing`. The sample table's own names are what a reader is checking
 * against, so those are the ones written. February marketing is planned
 * and never spent, which is the case the missing spend policy exists for, so it
 * is left out of the expense list on purpose rather than by omission.
 *
 * @property category - The category name.
 * @property month - The month.
 * @property planMinor - The target, in minor units.
 * @property spentMinor - What was spent, or null when nothing was.
 */
export const SPEC_ROWS: { category: string; month: string; planMinor: number; spentMinor: number | null }[] = [
  { category: 'Marketing', month: '2026-01', planMinor: 500_000, spentMinor: 480_000 },
  { category: 'Payroll', month: '2026-01', planMinor: 2_000_000, spentMinor: 2_050_000 },
  { category: 'Marketing', month: '2026-02', planMinor: 500_000, spentMinor: null },
  { category: 'Payroll', month: '2026-02', planMinor: 2_000_000, spentMinor: 1_980_000 },
];

/** The months the demo seeder covers. */
export const DEMO_FIRST_MONTH = '2026-01';
export const DEMO_MONTH_COUNT = 12;

/** How many expenses the demo seeder writes. */
export const DEMO_EXPENSE_COUNT = 100;

/** The quarter the demo seeder closes, so a reviewer can see a lock reject an edit. */
export const DEMO_LOCKED_QUARTER = '2026-Q1';

/**
 * The categories the demo seeder plans against.
 *
 * @remarks
 * A subset of the shared catalogue rather than all forty. A demo where every
 * category has a target is not what a real account looks like, and the report is
 * more interesting when some spend is unplanned.
 */
export const DEMO_PLANNED_CATEGORIES = [
  'Salaries',
  'Advertising',
  'Cloud Hosting',
  'Software Subscriptions',
  'Consulting',
  'Employee Travel',
  'Office Rent',
  'Utilities',
];

/**
 * Categories the demo seeder spends against without planning.
 *
 * @remarks
 * Deliberate. Unplanned spend is the row a naive report drops, so the demo data
 * has to contain some or the bug would not show up when looking at it.
 */
export const DEMO_UNPLANNED_CATEGORIES = ['Legal Fees', 'Recruitment'];
