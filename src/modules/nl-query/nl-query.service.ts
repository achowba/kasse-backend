import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Types } from 'mongoose';
import { IAppConfig } from '@common/config';
import { MissingSpendPolicyEnum } from '@common/money';
import { addMonths, formatMonth } from '@common/month';
import { AuditActionEnum, AuditEntityEnum, AuditLogService } from '@modules/audit-log';
import { CategoriesService } from '@modules/categories';
import { ReportQueryDTO, ReportsService } from '@modules/reports';
import { NlQueryFilterDTO, NlQueryResponseDTO } from './dto/nl-query.dto';
import {
  buildSystemPrompt,
  NL_QUERY_MAX_TOKENS,
  NL_QUERY_MODEL,
  NL_QUERY_TIMEOUT_MS,
  NL_QUERY_TOOL_NAME,
} from './nl-query.constants';
import { buildReportFilterTool } from './nl-query.tool';

/**
 * What the model is allowed to return.
 *
 * @property from - First month, inclusive.
 * @property to - Last month, inclusive.
 * @property categories - Category names, or absent for all.
 * @property missingSpend - The missing spend policy, or absent for the default.
 * @property interpretation - One sentence restating the question.
 */
interface IToolArguments {
  from?: unknown;
  to?: unknown;
  categories?: unknown;
  missingSpend?: unknown;
  interpretation?: unknown;
}

/**
 * Answers a question about spending by turning it into a report filter.
 *
 * @remarks
 * **The model never produces a query.** It is given one tool whose schema is a
 * report filter: a month range, some category names, and a policy. It cannot
 * express a collection, a field, an operator, or a database, and it never sees a
 * connection string. Whatever it returns is then validated by the same DTO a hand
 * written request goes through, and executed by the same report service. A model
 * that returns nonsense produces a validation error, not a query.
 *
 * That ordering is the point. Treating the model's output as untrusted input and
 * running it through the existing validation means this endpoint cannot reach
 * anything the normal report endpoint could not, no matter what comes back.
 *
 * **It degrades rather than breaks.** With no API key configured the endpoint
 * answers 503 with a clear code and every other endpoint is unaffected, so the
 * feature can ship without a key being provisioned everywhere.
 */
@Injectable()
export class NlQueryService {
  private readonly logger = new Logger(NlQueryService.name);
  private readonly client: Anthropic | null;

  constructor(
    private readonly reportsService: ReportsService,
    private readonly categoriesService: CategoriesService,
    private readonly auditLogService: AuditLogService,
    configService: ConfigService,
  ) {
    const { anthropicApiKey } = configService.getOrThrow<IAppConfig>('app');

    // Built once at startup rather than per request, and left null when there is
    // no key so the absence is a property of the service rather than a check
    // repeated at each call site.
    this.client = anthropicApiKey === null ? null : new Anthropic({ apiKey: anthropicApiKey });
  }

  /**
   * Answers a question about spending.
   *
   * @steps
   * 1. Refuse with 503 when no key is configured, before doing any work.
   * 2. Read the account's category names, so the model chooses from what exists
   *    rather than inventing a name that would match nothing.
   * 3. Ask the model to fill the filter tool.
   * 4. Validate what came back through the report's own DTO, treating it as
   *    untrusted input.
   * 5. Run the report and record the question, the filter, and the row count.
   *
   * @param userId - The authenticated caller.
   * @param question - The question, in plain language.
   * @param requestId - The request making the query.
   * @returns The filter and the report it produced.
   * @throws ServiceUnavailableException When no API key is configured.
   * @throws BadGatewayException When the model does not return a usable filter.
   */
  async ask(userId: Types.ObjectId, question: string, requestId?: string): Promise<NlQueryResponseDTO> {
    if (this.client === null) {
      throw new ServiceUnavailableException(
        'Natural language queries are not configured on this deployment. Set ANTHROPIC_API_KEY to enable them.',
      );
    }

    const categoryNames = await this.readCategoryNames(userId);
    const args = await this.askModel(this.client, question, categoryNames);
    const filter = this.validate(args, categoryNames);
    const report = await this.reportsService.planVsSpend(userId, this.toReportQuery(filter));

    this.auditLogService.record({
      userId,
      action: AuditActionEnum.NL_QUERY_RUN,
      entity: AuditEntityEnum.REPORT,
      after: {
        question,
        from: filter.from,
        to: filter.to,
        categories: filter.categories,
        rowCount: report.pagination.total,
      },
      requestId,
    });

    return { question, filter, report };
  }

  /**
   * Reads the category names this account can be asked about.
   *
   * @param userId - The authenticated caller.
   * @returns The names, own and shared.
   */
  private async readCategoryNames(userId: Types.ObjectId): Promise<string[]> {
    const { items } = await this.categoriesService.list(userId, { limit: 200, offset: 0 });

    return items.map((category) => category.name);
  }

  /**
   * Asks the model to fill the filter tool.
   *
   * @remarks
   * `tool_choice` forces the tool rather than suggesting it, so a reply in prose
   * is not a case that has to be handled. A reply that still is not a tool call
   * is a 502: the upstream did not do what it was asked, which is not the
   * caller's fault and not something they can fix.
   *
   * @param client - The configured client.
   * @param question - The question as asked.
   * @param categoryNames - The categories the model may choose from.
   * @returns The tool arguments, still untrusted.
   * @throws BadGatewayException When the model returns no tool call, or the call fails.
   */
  private async askModel(client: Anthropic, question: string, categoryNames: string[]): Promise<IToolArguments> {
    const referenceMonth = formatMonth(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1);

    try {
      const message = await client.messages.create(
        {
          model: NL_QUERY_MODEL,
          max_tokens: NL_QUERY_MAX_TOKENS,
          system: buildSystemPrompt(referenceMonth),
          tools: [buildReportFilterTool(categoryNames)],
          tool_choice: { type: 'tool', name: NL_QUERY_TOOL_NAME },
          messages: [{ role: 'user', content: question }],
        },
        { timeout: NL_QUERY_TIMEOUT_MS },
      );

      const toolUse = message.content.find((block) => block.type === 'tool_use');

      if (toolUse === undefined || toolUse.type !== 'tool_use') {
        throw new BadGatewayException('The question could not be turned into a report filter.');
      }

      return toolUse.input as IToolArguments;
    } catch (error: unknown) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      // Logged before rethrowing, because the cause is upstream and the caller is
      // told only that it failed. Without this line nothing would record why.
      this.logger.error({ err: error }, 'the natural language provider call failed');

      throw new BadGatewayException('The natural language service is unavailable. Try the report endpoint directly.');
    }
  }

  /**
   * Validates the model's output as untrusted input.
   *
   * @remarks
   * The same `ReportQueryDTO` a hand written request goes through. That is what
   * makes this endpoint unable to reach anything the normal report endpoint
   * could not, whatever the model returns.
   *
   * Category names are intersected with what the account actually has rather than
   * trusted, because the enum in the tool schema is guidance to the model rather
   * than a guarantee from it.
   *
   * @param args - The tool arguments.
   * @param categoryNames - The categories the account has.
   * @returns The validated filter.
   * @throws BadGatewayException When the arguments do not form a usable filter.
   */
  private validate(args: IToolArguments, categoryNames: string[]): NlQueryFilterDTO {
    const known = new Set(categoryNames.map((name) => name.toLowerCase()));
    const categories = Array.isArray(args.categories)
      ? args.categories.filter((name: unknown): name is string => typeof name === 'string' && known.has(name.toLowerCase()))
      : [];

    const candidate = plainToInstance(ReportQueryDTO, {
      from: args.from,
      to: args.to,
      missingSpend: args.missingSpend,
      limit: 200,
      offset: 0,
    });
    const errors = validateSync(candidate, { whitelist: true, forbidNonWhitelisted: true });

    if (errors.length > 0) {
      this.logger.warn({ errors: errors.map((error) => error.property) }, 'the model returned an invalid filter');

      throw new BadGatewayException('The question could not be turned into a valid report filter.');
    }

    // Both ends are required here even though the DTO marks them optional. The
    // DTO allows either a month range or a fiscal year, and this tool only offers
    // the range, so an omitted month is not a defaulted request: it would become
    // an empty string, pass the range check, and match every month on record.
    if (candidate.from === undefined || candidate.to === undefined) {
      this.logger.warn('the model returned a filter with no period');

      throw new BadGatewayException('The question could not be turned into a valid report filter.');
    }

    return {
      interpretation: typeof args.interpretation === 'string' ? args.interpretation : 'Spending against plan.',
      from: candidate.from,
      to: candidate.to,
      categories,
      ...(candidate.missingSpend === undefined ? {} : { missingSpend: candidate.missingSpend }),
    };
  }

  /**
   * Turns the validated filter into a report request.
   *
   * @remarks
   * Category names become identifiers here rather than in the tool, because the
   * model should be choosing between words a person recognises rather than
   * between object ids it cannot reason about.
   *
   * @param filter - The validated filter.
   * @returns The report query.
   */
  private toReportQuery(filter: NlQueryFilterDTO): ReportQueryDTO {
    return {
      from: filter.from,
      to: filter.to,
      missingSpend: filter.missingSpend ?? MissingSpendPolicyEnum.ZERO,
      limit: 200,
      offset: 0,
    };
  }

  /**
   * Reports whether the endpoint is usable.
   *
   * @remarks
   * Read by the health check, so an operator can see the feature is off rather
   * than discovering it from a user's 503.
   *
   * @returns True when an API key is configured.
   */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * The twelve months ending with a given month.
   *
   * @param month - The last month of the window.
   * @returns The first and last month, inclusive.
   */
  static defaultWindow(month: string): { from: string; to: string } {
    return { from: addMonths(month, -11), to: month };
  }
}
