/**
 * The model the endpoint asks.
 *
 * @remarks
 * The task is filling a small fixed schema from one sentence, which does not
 * need a frontier model. Named here rather than in the service so upgrading is a
 * one line change with a visible diff.
 */
export const NL_QUERY_MODEL = 'claude-sonnet-5';

/**
 * How many tokens the reply may use.
 *
 * @remarks
 * The reply is a tool call carrying at most six short fields, so this is far more
 * than needed. It exists as a ceiling on a runaway response rather than as a
 * target.
 */
export const NL_QUERY_MAX_TOKENS = 1_024;

/**
 * The name of the one tool the model is given.
 *
 * @remarks
 * One tool, and it is not a query. The model fills in a report filter and can do
 * nothing else: it never sees a connection string, never writes a database query,
 * and cannot reach anything this name does not describe. That is the whole
 * security model of this feature, and it is why the filter goes through the same
 * validation a hand written request does before it runs.
 */
export const NL_QUERY_TOOL_NAME = 'build_report_filter';

/**
 * How long the model has to answer.
 *
 * @remarks
 * A user waiting on a question they typed will not wait a minute. Failing fast
 * with a clear message beats an open request holding a connection.
 */
export const NL_QUERY_TIMEOUT_MS = 20_000;

/** The longest question accepted. */
export const MAX_QUESTION_LENGTH = 500;

/**
 * What the model is told before the question.
 *
 * @remarks
 * States the reference month so relative phrasing such as "last quarter" resolves
 * to something rather than to whenever the model believes the present to be. The
 * rest is deliberately short: the tool schema carries the real constraints, and a
 * long prompt restating them is a second source of truth that drifts.
 */
export const buildSystemPrompt = (referenceMonth: string): string =>
  [
    'You turn a question about spending into a report filter.',
    `Today is in ${referenceMonth}. Resolve relative periods such as "last quarter" or "this year" against that month.`,
    'Always call the tool. Never answer in prose.',
    'Months are YYYY-MM. A range is inclusive at both ends.',
    'If the question names no period, use the twelve months ending with the reference month.',
    'Only use category names the user listed. If none match, leave categories empty rather than inventing one.',
  ].join(' ');
