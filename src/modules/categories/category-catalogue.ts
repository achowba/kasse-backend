/**
 * The shared category catalogue.
 *
 * @remarks
 * Seeded once with `userId: null`, so every account can select these without a
 * copy per account. A signup that duplicated forty rows would make the catalogue
 * impossible to correct later: renaming one entry would leave every existing
 * account with the old name.
 *
 * Chosen to cover the spending an operating business actually reports on, across
 * payroll, marketing, technology, facilities, professional services, and finance.
 * They are deliberately non overlapping: two categories that could both plausibly
 * hold the same invoice make a variance report meaningless, because the same
 * overspend appears in whichever one the person picked that month.
 */
export const CATEGORY_CATALOGUE = [
  // People
  'Salaries',
  'Contractors',
  'Payroll Taxes',
  'Employee Benefits',
  'Recruitment',
  'Training and Development',
  'Employee Travel',
  'Team Events',

  // Go to market
  'Advertising',
  'Content and Creative',
  'Events and Sponsorships',
  'Public Relations',
  'Sales Commissions',
  'Customer Success Tools',

  // Technology
  'Cloud Hosting',
  'Software Subscriptions',
  'Data and Analytics',
  'Security and Compliance Tools',
  'Hardware and Devices',
  'Domains and Certificates',
  'Third Party APIs',

  // Facilities
  'Office Rent',
  'Utilities',
  'Office Supplies',
  'Cleaning and Maintenance',
  'Furniture and Fixtures',

  // Professional services
  'Legal Fees',
  'Accounting and Audit',
  'Consulting',
  'Tax Advisory',
  'Insurance',

  // Finance and operations
  'Bank Charges',
  'Payment Processing Fees',
  'Foreign Exchange Costs',
  'Interest Expense',
  'Loan Repayments',
  'Government Fees and Licences',
  'Shipping and Logistics',
  'Inventory Purchases',
  'Bad Debt',
] as const;
