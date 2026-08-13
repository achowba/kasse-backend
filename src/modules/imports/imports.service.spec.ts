import { BadRequestException } from '@nestjs/common';
import { Connection, Types } from 'mongoose';
import { DataVersionService } from '@common/cache';
import { AppException } from '@common/errors';
import { AuditLogService } from '@modules/audit-log';
import { CategoriesService } from '@modules/categories';
import { ExpensesService } from '@modules/expenses';
import { PeriodLockedException, PeriodLocksService } from '@modules/period-locks';
import { ImportStatusEnum } from './imports.enums';
import { ImportsRepository } from './imports.repository';
import { ImportsService } from './imports.service';
import { ImportBatchDocument } from './schemas/import-batch.schema';

const marketingId = new Types.ObjectId();
const payrollId = new Types.ObjectId();

/** Stand in for a stored batch. */
const buildBatch = (overrides: Partial<ImportBatchDocument> = {}): ImportBatchDocument =>
  ({
    _id: new Types.ObjectId(),
    filename: 'expenses.csv',
    status: ImportStatusEnum.COMPLETED,
    rowCount: 2,
    errorCount: 0,
    errors: [],
    expenseCount: 2,
    createdAt: new Date('2026-01-15T10:04:11.212Z'),
    ...overrides,
  }) as unknown as ImportBatchDocument;

/**
 * Builds a CSV buffer from lines.
 *
 * @param lines - The lines, header first.
 * @returns The file's bytes.
 */
const csv = (...lines: string[]): Buffer => Buffer.from(lines.join('\n'), 'utf8');

const header = 'category,month,amount,note';
const goodFile = csv(header, 'Marketing,2026-01,4800.00,', 'Payroll,2026-01,20500.00,');

describe('ImportsService', () => {
  const userId = new Types.ObjectId();
  let repository: jest.Mocked<Pick<ImportsRepository, 'findByIdempotencyKey' | 'record' | 'list' | 'findById'>>;
  let expenses: jest.Mocked<Pick<ExpensesService, 'createManyFromImport'>>;
  let categories: jest.Mocked<Pick<CategoriesService, 'resolveByName'>>;
  let periodLocks: jest.Mocked<Pick<PeriodLocksService, 'assertAllUnlocked'>>;
  let auditLog: jest.Mocked<Pick<AuditLogService, 'recordWithin'>>;
  let dataVersion: jest.Mocked<Pick<DataVersionService, 'bump'>>;
  let connection: Connection;
  let service: ImportsService;

  beforeEach(() => {
    repository = {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      record: jest.fn().mockResolvedValue(buildBatch()),
      list: jest.fn().mockResolvedValue({ batches: [buildBatch()], total: 1 }),
      findById: jest.fn().mockResolvedValue(buildBatch()),
    };

    expenses = { createManyFromImport: jest.fn().mockResolvedValue([]) };
    categories = {
      resolveByName: jest.fn().mockImplementation((_userId: Types.ObjectId, name: string) => {
        const known: Record<string, Types.ObjectId> = { Marketing: marketingId, Payroll: payrollId };

        return Promise.resolve(name in known ? { _id: known[name] } : null);
      }),
    };
    periodLocks = { assertAllUnlocked: jest.fn().mockResolvedValue(undefined) };
    auditLog = { recordWithin: jest.fn().mockResolvedValue(undefined) };
    dataVersion = { bump: jest.fn() };

    // withTransaction runs the callback against a session from the connection.
    // A stub session is enough: the transaction semantics belong to MongoDB and
    // are covered end to end, not here.
    connection = {
      startSession: jest.fn().mockResolvedValue({
        withTransaction: (callback: () => Promise<unknown>) => callback(),
        endSession: jest.fn(),
      }),
    } as unknown as Connection;

    service = new ImportsService(
      repository as unknown as ImportsRepository,
      expenses as unknown as ExpensesService,
      categories as unknown as CategoriesService,
      periodLocks as unknown as PeriodLocksService,
      auditLog as unknown as AuditLogService,
      dataVersion as unknown as DataVersionService,
      connection,
    );
  });

  describe('a file that imports', () => {
    it('writes every row against its resolved category', async () => {
      await service.importExpenses(userId, 'key-1', 'expenses.csv', goodFile);

      expect(expenses.createManyFromImport).toHaveBeenCalledWith(
        userId,
        [
          { categoryId: marketingId, month: '2026-01', amountMinor: 480_000, note: null },
          { categoryId: payrollId, month: '2026-01', amountMinor: 2_050_000, note: null },
        ],
        expect.anything(),
        expect.anything(),
      );
    });

    it('records the batch as completed', async () => {
      await service.importExpenses(userId, 'key-1', 'expenses.csv', goodFile);

      expect(repository.record).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ status: ImportStatusEnum.COMPLETED, rowCount: 2, expenseCount: 2, errorCount: 0 }),
        expect.anything(),
      );
    });

    it('audits inside the transaction, so a rollback leaves no entry claiming it happened', async () => {
      await service.importExpenses(userId, 'key-1', 'expenses.csv', goodFile);

      expect(auditLog.recordWithin).toHaveBeenCalled();
    });

    it('invalidates the report cache once, not once per row', async () => {
      await service.importExpenses(userId, 'key-1', 'expenses.csv', goodFile);

      expect(dataVersion.bump).toHaveBeenCalledTimes(1);
    });

    it('resolves a repeated category name once rather than per row', async () => {
      await service.importExpenses(
        userId,
        'key-1',
        'expenses.csv',
        csv(header, 'Marketing,2026-01,10.00,', 'Marketing,2026-02,20.00,', 'Marketing,2026-03,30.00,'),
      );

      // Three rows, one category. A thousand row file across forty categories
      // should not be a thousand lookups.
      expect(categories.resolveByName).toHaveBeenCalledTimes(1);
    });

    it('checks every month in the file in one call', async () => {
      await service.importExpenses(userId, 'key-1', 'expenses.csv', goodFile);

      expect(periodLocks.assertAllUnlocked).toHaveBeenCalledWith(userId, ['2026-01', '2026-01']);
    });
  });

  describe('failing closed', () => {
    it('writes nothing when one row is bad', async () => {
      await expect(
        service.importExpenses(
          userId,
          'key-1',
          'expenses.csv',
          csv(header, 'Marketing,2026-01,100.00,', 'Payroll,2026-13,20.00,'),
        ),
      ).rejects.toBeInstanceOf(AppException);

      // The good row is not written either. An import that landed half a file
      // could not be re-uploaded after a fix without doubling what did land.
      expect(expenses.createManyFromImport).not.toHaveBeenCalled();
    });

    it('records the failed attempt, so the user can find out why later', async () => {
      repository.record.mockResolvedValue(buildBatch({ status: ImportStatusEnum.FAILED, errorCount: 1, expenseCount: 0 }));

      await expect(
        service.importExpenses(userId, 'key-1', 'expenses.csv', csv(header, 'Payroll,2026-13,20.00,')),
      ).rejects.toBeInstanceOf(AppException);

      expect(repository.record).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ status: ImportStatusEnum.FAILED, expenseCount: 0 }),
      );
    });

    it('reports an unknown category as a row error rather than an exception', async () => {
      await expect(
        service.importExpenses(
          userId,
          'key-1',
          'expenses.csv',
          csv(header, 'Marketing,2026-01,10.00,', 'Nonsense,2026-01,20.00,'),
        ),
      ).rejects.toBeInstanceOf(AppException);

      expect(repository.record).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          errors: expect.arrayContaining([expect.objectContaining({ line: 3, column: 'category' })]) as unknown[],
        }),
      );
    });

    it('reports parse errors and unknown categories together, in file order', async () => {
      await expect(
        service.importExpenses(
          userId,
          'key-1',
          'expenses.csv',
          csv(header, 'Nonsense,2026-01,10.00,', 'Payroll,2026-13,20.00,', 'AlsoNonsense,2026-01,30.00,'),
        ),
      ).rejects.toBeInstanceOf(AppException);

      const recorded = repository.record.mock.calls[0]?.[1];
      const lines = (recorded?.errors ?? []).map((error) => error.line);

      // Sorted, because the two kinds of error are found in separate passes and
      // a user reads the list against their file top to bottom.
      expect(lines).toEqual([2, 3, 4]);
    });

    it('writes nothing when any month in the file is closed', async () => {
      periodLocks.assertAllUnlocked.mockRejectedValue(new PeriodLockedException('2026-01'));

      await expect(service.importExpenses(userId, 'key-1', 'expenses.csv', goodFile)).rejects.toBeInstanceOf(
        PeriodLockedException,
      );
      expect(expenses.createManyFromImport).not.toHaveBeenCalled();
    });

    it('rejects a structurally unusable file as a bad request, not a row error', async () => {
      await expect(
        service.importExpenses(userId, 'key-1', 'expenses.csv', csv('category,note', 'Marketing,hello')),
      ).rejects.toBeInstanceOf(BadRequestException);

      // No rows to attach the problem to, so reporting it as a row error would
      // be misleading.
      expect(repository.record).not.toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('returns the original batch without reading the file again', async () => {
      const original = buildBatch({ expenseCount: 7 });

      repository.findByIdempotencyKey.mockResolvedValue(original);

      const result = await service.importExpenses(userId, 'key-1', 'expenses.csv', goodFile);

      expect(result.expenseCount).toBe(7);
      expect(expenses.createManyFromImport).not.toHaveBeenCalled();
      expect(repository.record).not.toHaveBeenCalled();
    });

    it('imports normally under a different key', async () => {
      await service.importExpenses(userId, 'key-1', 'expenses.csv', goodFile);

      repository.findByIdempotencyKey.mockResolvedValue(null);
      await service.importExpenses(userId, 'key-2', 'expenses.csv', goodFile);

      expect(expenses.createManyFromImport).toHaveBeenCalledTimes(2);
    });

    it('returns the winner when two identical uploads race and the database refuses the second', async () => {
      const winner = buildBatch({ expenseCount: 2 });

      repository.record.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));
      repository.findByIdempotencyKey.mockResolvedValueOnce(null).mockResolvedValue(winner);

      const result = await service.importExpenses(userId, 'key-1', 'expenses.csv', goodFile);

      // The unique index, not the read, is what makes the replay guard correct.
      // Both requests miss the read; the database refuses the second write.
      expect(result.id).toBe(winner._id.toString());
    });
  });
});
