import { CaseInsensitiveSearchPlugin } from './plugins';

/**
 * Behaviour of the documentation UI.
 *
 * @remarks
 * `persistAuthorization` matters more than it looks: without it a pasted bearer
 * token is lost on every reload, which makes trying the protected routes in the
 * UI tedious enough that people stop doing it.
 */
export const SWAGGER_UI_OPTIONS = {
  filter: true,
  showRequestDuration: true,
  persistAuthorization: true,
  tagsSorter: 'alpha',
  operationsSorter: 'alpha',
  plugins: [CaseInsensitiveSearchPlugin],
};

/**
 * Prose shown at the top of the documentation.
 *
 * @remarks
 * States the rules a client cannot infer from the schemas alone. A reader who
 * only looks at the shapes would not learn that a zero plan yields a null
 * percentage, or that a delete is soft.
 */
export const API_DESCRIPTION = `Monthly spending targets, logged expenses, and variance reporting with locked periods.

**Money** is an integer count of minor units. A field ending in \`Minor\` holds cents.

**Months** are the string \`YYYY-MM\`.

**Variance** is \`spend - plan\`. Variance percent is \`null\` when the plan is zero, never \`NaN\`.

**Missing spend** default to \`0\`. Pass \`missingSpend=null\` to receive \`null\` instead. Every report row carries \`hasSpend\`, so a logged zero is never confused with nothing logged.

**Locked periods** reject writes with \`423\` and the code \`PERIOD_LOCKED\`.

**Deletes are soft.** A \`DELETE\` answers \`204\` and the record stops appearing in reads.

**Sessions** travel in the \`Authorization\` header, never a cookie, so a mobile or desktop client is a first class caller. Access tokens are RS256 signed and short lived; refresh tokens are opaque, single use, and rotate.`;

/**
 * The groups operations are organised into, with what each one is for.
 *
 * @remarks
 * A tag used by a controller but not declared here still groups correctly, but
 * its group has no description. Declaring them means the sidebar explains itself.
 */
export const API_TAGS: { name: string; description: string }[] = [
  { name: 'Auth', description: 'Establishing, renewing, and ending sessions.' },
  { name: 'Account', description: 'The signed in account and the settings reports are computed against.' },
  { name: 'Categories', description: 'The shared catalogue and the account’s own categories.' },
  { name: 'Period locks', description: 'Closing and reopening accounting periods. A closed period is read only.' },
  { name: 'Plans', description: 'Monthly spending targets, the plan side of the report.' },
  { name: 'Audit log', description: 'The append only trail of changes to financial data.' },
  { name: 'Health', description: 'Liveness and readiness probes.' },
];
