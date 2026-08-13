import { BadGatewayException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { MissingActualPolicyEnum } from '@common/money';
import { AuditActionEnum, AuditLogService } from '@modules/audit-log';
import { CategoriesService } from '@modules/categories';
import { ReportsService } from '@modules/reports';
import { NlQueryService } from './nl-query.service';

/**
 * The parts of the request under test.
 *
 * @property tools - The tool definitions offered to the model.
 * @property tool_choice - Whether the tool is forced.
 */
interface IModelRequest {
  tools: { input_schema: { properties: { categories: { items: { enum: string[] } } } } }[];
  tool_choice: { type: string; name: string };
}

/**
 * The mocked `messages.create`.
 *
 * @remarks
 * Typed rather than left as a bare `jest.fn()`, so reading the arguments back in
 * a test is a checked property access instead of an unsafe one on `any`.
 */
const create = jest.fn<Promise<unknown>, [IModelRequest]>();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: class {
    messages = { create };
  },
}));

/**
 * Builds a reply carrying a tool call.
 *
 * @param input - The arguments the model returned.
 * @returns A message shaped like the API's.
 */
const toolReply = (input: Record<string, unknown>): { content: { type: string; input: Record<string, unknown> }[] } => ({
  content: [{ type: 'tool_use', input }],
});

const validArgs = { from: '2026-01', to: '2026-03', categories: ['Marketing'], interpretation: 'Marketing in Q1 2026.' };

describe('NlQueryService', () => {
  const userId = new Types.ObjectId();
  let reports: jest.Mocked<Pick<ReportsService, 'planVsActual'>>;
  let categories: jest.Mocked<Pick<CategoriesService, 'list'>>;
  let auditLog: jest.Mocked<Pick<AuditLogService, 'record'>>;

  /**
   * Builds the service with or without an API key.
   *
   * @param apiKey - The key to configure, or null for none.
   * @returns The service.
   */
  const build = (apiKey: string | null): NlQueryService => {
    const configService = { getOrThrow: jest.fn().mockReturnValue({ anthropicApiKey: apiKey }) };

    return new NlQueryService(
      reports as unknown as ReportsService,
      categories as unknown as CategoriesService,
      auditLog as unknown as AuditLogService,
      configService as unknown as ConfigService,
    );
  };

  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue(toolReply(validArgs));

    reports = {
      planVsActual: jest.fn().mockResolvedValue({
        items: [],
        totals: { planMinor: 0, actualMinor: 0, varianceMinor: 0, variancePercent: null },
        pagination: { limit: 200, offset: 0, total: 0 },
      }),
    };
    categories = {
      list: jest.fn().mockResolvedValue({
        items: [{ name: 'Marketing' }, { name: 'Payroll' }],
        pagination: { limit: 200, offset: 0, total: 2 },
      }),
    };
    auditLog = { record: jest.fn() };
  });

  describe('without an API key', () => {
    it('answers 503 rather than failing at startup', async () => {
      await expect(build(null).ask(userId, 'anything')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('does not call the model at all', async () => {
      await expect(build(null).ask(userId, 'anything')).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(create).not.toHaveBeenCalled();
    });

    it('reports itself as unconfigured, so an operator can see it before a user does', () => {
      expect(build(null).isConfigured()).toBe(false);
      expect(build('a-key').isConfigured()).toBe(true);
    });
  });

  describe('turning a question into a filter', () => {
    it('runs the report the model described', async () => {
      await build('a-key').ask(userId, 'How did marketing do in Q1 2026?');

      expect(reports.planVsActual).toHaveBeenCalledWith(userId, expect.objectContaining({ from: '2026-01', to: '2026-03' }));
    });

    it('returns the interpretation alongside the data', async () => {
      const answer = await build('a-key').ask(userId, 'How did marketing do in Q1 2026?');

      // A user has to be able to see that the question was read the way they
      // meant it. An answer with no visible interpretation is one they have to
      // trust blindly.
      expect(answer.filter.interpretation).toBe('Marketing in Q1 2026.');
      expect(answer.question).toBe('How did marketing do in Q1 2026?');
    });

    it('offers the model only this account’s categories', async () => {
      await build('a-key').ask(userId, 'anything');

      const tool = create.mock.calls[0]?.[0].tools[0];

      expect(tool?.input_schema.properties.categories.items.enum).toEqual(['Marketing', 'Payroll']);
    });

    it('forces the tool rather than allowing a prose answer', async () => {
      await build('a-key').ask(userId, 'anything');

      expect(create.mock.calls[0]?.[0].tool_choice.type).toBe('tool');
    });

    it('records the question and how it was read', async () => {
      await build('a-key').ask(userId, 'How did marketing do in Q1 2026?');

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditActionEnum.NL_QUERY_RUN,
          after: expect.objectContaining({ question: 'How did marketing do in Q1 2026?', from: '2026-01' }) as Record<
            string,
            unknown
          >,
        }),
      );
    });
  });

  describe('treating the model as untrusted', () => {
    it('rejects a malformed month rather than passing it to the database', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      create.mockResolvedValue(toolReply({ ...validArgs, from: 'last January' }));

      await expect(build('a-key').ask(userId, 'anything')).rejects.toBeInstanceOf(BadGatewayException);
      expect(reports.planVsActual).not.toHaveBeenCalled();
    });

    it('rejects a missing month', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      create.mockResolvedValue(toolReply({ to: '2026-03', interpretation: 'x' }));

      await expect(build('a-key').ask(userId, 'anything')).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('drops a category the account does not have rather than filtering on it', async () => {
      create.mockResolvedValue(toolReply({ ...validArgs, categories: ['Marketing', 'Offshore Slush Fund'] }));

      const answer = await build('a-key').ask(userId, 'anything');

      // The enum in the tool schema is guidance to the model, not a guarantee
      // from it, so the names are intersected with what the account really has.
      expect(answer.filter.categories).toEqual(['Marketing']);
    });

    it('ignores fields the filter does not define', async () => {
      create.mockResolvedValue(
        toolReply({ ...validArgs, userId: 'someone-else', $where: 'this.amountMinor > 0', limit: 999_999 }),
      );

      const answer = await build('a-key').ask(userId, 'anything');

      // Nothing extra survives into the report request. This is the property the
      // whole design rests on: the model's output is input, not instructions.
      expect(reports.planVsActual).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ from: '2026-01', to: '2026-03', limit: 200, offset: 0 }),
      );
      expect(answer.filter).not.toHaveProperty('$where');
    });

    it('accepts a valid missing actual policy', async () => {
      create.mockResolvedValue(toolReply({ ...validArgs, missingActuals: MissingActualPolicyEnum.NULL }));

      const answer = await build('a-key').ask(userId, 'anything');

      expect(answer.filter.missingActuals).toBe(MissingActualPolicyEnum.NULL);
    });

    it('rejects an invalid policy rather than falling back silently', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      create.mockResolvedValue(toolReply({ ...validArgs, missingActuals: 'whatever' }));

      await expect(build('a-key').ask(userId, 'anything')).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('supplies an interpretation when the model omits one', async () => {
      create.mockResolvedValue(toolReply({ from: '2026-01', to: '2026-03' }));

      const answer = await build('a-key').ask(userId, 'anything');

      expect(answer.filter.interpretation).toBe('Spending against plan.');
    });
  });

  describe('when the provider fails', () => {
    it('answers 502 and logs the cause', async () => {
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      create.mockRejectedValue(new Error('connection reset'));

      await expect(build('a-key').ask(userId, 'anything')).rejects.toBeInstanceOf(BadGatewayException);

      // The caller is told only that it failed, so without this line nothing
      // would record why.
      expect(logged).toHaveBeenCalled();
    });

    it('answers 502 when the reply carries no tool call', async () => {
      create.mockResolvedValue({ content: [{ type: 'text', text: 'I am not sure.' }] });

      await expect(build('a-key').ask(userId, 'anything')).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('does not audit a query that never ran', async () => {
      create.mockRejectedValue(new Error('connection reset'));
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(build('a-key').ask(userId, 'anything')).rejects.toBeInstanceOf(BadGatewayException);
      expect(auditLog.record).not.toHaveBeenCalled();
    });
  });
});
