import type Anthropic from '@anthropic-ai/sdk';
import { MissingSpendPolicyEnum } from '@common/money';
import { MONTH_PATTERN } from '@common/month';
import { SeriesGroupByEnum } from '@modules/reports';
import { NL_QUERY_TOOL_NAME } from './nl-query.constants';

/**
 * The only tool the model is given.
 *
 * @remarks
 * This is the security boundary of the whole feature, so it is worth being
 * precise about what it is not. It is **not** a query. The model cannot express
 * a collection, a field, an operator, or a database at all. It fills in six
 * fields describing a report a user could have asked for through the normal
 * endpoint, and the arguments it returns are validated by the same DTO a hand
 * written request goes through before anything runs.
 *
 * The category list is passed in rather than left open, so the model chooses from
 * what the account actually has instead of inventing a name that would silently
 * match nothing.
 *
 * @param categoryNames - The categories this account can be asked about.
 * @returns The tool definition, as the Anthropic API expects it.
 */
export const buildReportFilterTool = (categoryNames: string[]): Anthropic.Tool => ({
  name: NL_QUERY_TOOL_NAME,
  description:
    'Build the filter for a plan against spend spending report. Call this once with the period and categories the question is about.',
  input_schema: {
    type: 'object' as const,
    properties: {
      from: {
        type: 'string',
        pattern: MONTH_PATTERN.source,
        description: 'First month of the period, inclusive, as YYYY-MM.',
      },
      to: {
        type: 'string',
        pattern: MONTH_PATTERN.source,
        description: 'Last month of the period, inclusive, as YYYY-MM.',
      },
      categories: {
        type: 'array',
        items: { type: 'string', enum: categoryNames },
        description:
          'Category names the question is about. Leave empty for every category. Only names from the list are allowed.',
      },
      groupBy: {
        type: 'string',
        enum: Object.values(SeriesGroupByEnum),
        description: 'Set only when the question asks for a trend or a chart rather than a table.',
      },
      missingSpend: {
        type: 'string',
        enum: Object.values(MissingSpendPolicyEnum),
        description:
          'Use "null" when the question distinguishes months with nothing logged, otherwise leave unset for the default.',
      },
      interpretation: {
        type: 'string',
        description: 'One short sentence restating the question as you understood it, shown back to the user.',
      },
    },
    required: ['from', 'to', 'interpretation'],
    additionalProperties: false,
  },
});
