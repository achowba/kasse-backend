import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DataVersionService } from '@common/cache';
import { AuditActionEnum, AuditLogService } from '@modules/audit-log';
import { CategoriesService } from '@modules/categories';
import { PeriodLockedException, PeriodLocksService } from '@modules/period-locks';
import { ExpenseSourceEnum } from './expenses.enums';
import { ExpensesRepository } from './expenses.repository';
import { ExpensesService } from './expenses.service';
import { ExpenseDocument } from './schemas/expense.schema';

/** Stand in for a stored expense. */
const buildExpense = (overrides: Partial<ExpenseDocument> = {}): ExpenseDocument =>
  ({
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    month: '2026-01',
    amountMinor: 480_000,
    note: null,
    source: ExpenseSourceEnum.MANUAL,
    importBatchId: null,
    createdAt: new Date('2026-01-15T10:04:11.212Z'),
    deletedAt: null,
    ...overrides,
  }) as unknown as ExpenseDocument;

describe('ExpensesService', () => {
  const userId = new Types.ObjectId();
  const categoryId = new Types.ObjectId();
  let repository: jest.Mocked<Pick<ExpensesRepository, 'create' | 'findById' | 'updateOne' | 'softDelete' | 'list'>>;
  let periodLocks: jest.Mocked<Pick<PeriodLocksService, 'assertUnlocked' | 'assertMoveAllowed'>>;
  let categories: jest.Mocked<Pick<CategoriesService, 'getVisibleById'>>;
  let auditLog: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let dataVersion: jest.Mocked<Pick<DataVersionService, 'bump'>>;
  let service: ExpensesService;

  beforeEach(() => {
    repository = {
      create: jest.fn().mockResolvedValue(buildExpense()),
      findById: jest.fn().mockResolvedValue(buildExpense()),
      updateOne: jest.fn().mockResolvedValue(buildExpense({ amountMinor: 490_000 })),
      softDelete: jest.fn().mockResolvedValue(true),
      list: jest.fn().mockResolvedValue({ expenses: [buildExpense()], total: 1 }),
    };

    periodLocks = {
      assertUnlocked: jest.fn().mockResolvedValue(undefined),
      assertMoveAllowed: jest.fn().mockResolvedValue(undefined),
    };
    categories = { getVisibleById: jest.fn().mockResolvedValue({ _id: categoryId }) };
    auditLog = { record: jest.fn() };
    dataVersion = { bump: jest.fn() };

    service = new ExpensesService(
      repository as unknown as ExpensesRepository,
      periodLocks as unknown as PeriodLocksService,
      categories as unknown as CategoriesService,
      auditLog as unknown as AuditLogService,
      dataVersion as unknown as DataVersionService,
    );
  });

  const input = { categoryId: categoryId.toString(), month: '2026-01', amountMinor: 480_000 };

  describe('logging an expense', () => {
    it('checks the lock before anything else, so a closed period is the reason reported', async () => {
      periodLocks.assertUnlocked.mockRejectedValue(new PeriodLockedException('2026-01'));

      await expect(service.create(userId, input)).rejects.toBeInstanceOf(PeriodLockedException);

      expect(categories.getVisibleById).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects a category the caller cannot use', async () => {
      categories.getVisibleById.mockRejectedValue(new NotFoundException('Category not found.'));

      await expect(service.create(userId, input)).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('stamps the expense as manually entered, with no import batch', async () => {
      await service.create(userId, input);

      expect(repository.create).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ source: ExpenseSourceEnum.MANUAL, importBatchId: null }),
      );
    });

    it('creates a second expense rather than replacing the first for the same cell', async () => {
      await service.create(userId, input);
      await service.create(userId, input);

      // The report sums a category's expenses for a month. Two calls are two
      // line items, which is what makes concurrent logging safe.
      expect(repository.create).toHaveBeenCalledTimes(2);
    });

    it('accepts a negative amount, which a refund produces', async () => {
      await service.create(userId, { ...input, amountMinor: -25_000 });

      expect(repository.create).toHaveBeenCalledWith(userId, expect.objectContaining({ amountMinor: -25_000 }));
    });

    it('records the creation', async () => {
      await service.create(userId, input);

      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: AuditActionEnum.EXPENSE_CREATED }));
    });
  });

  describe('correcting an expense', () => {
    it('answers not found for an expense the caller does not have', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.update(userId, new Types.ObjectId(), { amountMinor: 1 })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('checks both months when the month changes', async () => {
      repository.findById.mockResolvedValue(buildExpense({ month: '2026-01' }));

      await service.update(userId, new Types.ObjectId(), { month: '2026-02' });

      // Both ends. Moving an expense out of a closed month changes that month's
      // total, so the source is as much an edit as the destination.
      expect(periodLocks.assertMoveAllowed).toHaveBeenCalledWith(userId, '2026-01', '2026-02');
    });

    it('checks the stored month, not one the caller supplied, when the month is unchanged', async () => {
      repository.findById.mockResolvedValue(buildExpense({ month: '2026-07' }));

      await service.update(userId, new Types.ObjectId(), { amountMinor: 1 });

      expect(periodLocks.assertMoveAllowed).toHaveBeenCalledWith(userId, '2026-07', '2026-07');
    });

    it('refuses a move that touches a closed month, and writes nothing', async () => {
      periodLocks.assertMoveAllowed.mockRejectedValue(new PeriodLockedException('2026-01'));

      await expect(service.update(userId, new Types.ObjectId(), { month: '2026-02' })).rejects.toBeInstanceOf(
        PeriodLockedException,
      );
      expect(repository.updateOne).not.toHaveBeenCalled();
    });

    it('leaves an omitted field alone rather than overwriting it with undefined', async () => {
      await service.update(userId, new Types.ObjectId(), { amountMinor: 490_000 });

      expect(repository.updateOne).toHaveBeenCalledWith(userId, expect.anything(), { $set: { amountMinor: 490_000 } });
    });

    it('rejects a new category the caller cannot use, and writes nothing', async () => {
      categories.getVisibleById.mockRejectedValue(new NotFoundException('Category not found.'));

      await expect(
        service.update(userId, new Types.ObjectId(), { categoryId: new Types.ObjectId().toString() }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.updateOne).not.toHaveBeenCalled();
    });

    it('applies every supplied field together', async () => {
      const newCategoryId = new Types.ObjectId();

      await service.update(userId, new Types.ObjectId(), {
        categoryId: newCategoryId.toString(),
        month: '2026-03',
        amountMinor: 12_345,
        note: 'Reclassified after review',
      });

      expect(repository.updateOne).toHaveBeenCalledWith(userId, expect.anything(), {
        $set: {
          categoryId: newCategoryId,
          month: '2026-03',
          amountMinor: 12_345,
          note: 'Reclassified after review',
        },
      });
    });

    it('accepts an empty note, which is how a note is cleared', async () => {
      await service.update(userId, new Types.ObjectId(), { note: '' });

      // Distinct from omitting the field. An omitted note is left alone, an
      // empty one is a deliberate erasure, so it has to survive the assembly
      // step rather than being treated as absent.
      expect(repository.updateOne).toHaveBeenCalledWith(userId, expect.anything(), { $set: { note: '' } });
    });

    it('records both sides of the change', async () => {
      repository.findById.mockResolvedValue(buildExpense({ amountMinor: 480_000 }));

      await service.update(userId, new Types.ObjectId(), { amountMinor: 490_000 });

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditActionEnum.EXPENSE_UPDATED,
          before: expect.objectContaining({ amountMinor: 480_000 }) as Record<string, unknown>,
          after: expect.objectContaining({ amountMinor: 490_000 }) as Record<string, unknown>,
        }),
      );
    });

    it('answers not found when the expense disappears between the read and the write', async () => {
      repository.updateOne.mockResolvedValue(null);

      await expect(service.update(userId, new Types.ObjectId(), { amountMinor: 1 })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('writing from an import', () => {
    const session = { id: 'session' } as never;
    const importBatchId = new Types.ObjectId();
    const rows = [
      { categoryId, month: '2026-01', amountMinor: 480_000, note: null },
      { categoryId, month: '2026-02', amountMinor: 500_000, note: 'Second row' },
    ];

    it('stamps every row as imported and ties it to the batch', async () => {
      await service.createManyFromImport(userId, rows, importBatchId, session);

      expect(repository.create).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ source: ExpenseSourceEnum.CSV, importBatchId }),
        session,
      );
      expect(repository.create).toHaveBeenCalledTimes(2);
    });

    it('writes inside the import transaction, so a later failure rolls the whole file back', async () => {
      await service.createManyFromImport(userId, rows, importBatchId, session);

      for (const call of repository.create.mock.calls) {
        expect(call[2]).toBe(session);
      }
    });

    it('does not check the lock per row, because the import checks the whole file once', async () => {
      await service.createManyFromImport(userId, rows, importBatchId, session);

      // Not a gap in enforcement: the import refuses to start when any month in
      // the file is closed. Repeating it here would be a round trip per row.
      expect(periodLocks.assertUnlocked).not.toHaveBeenCalled();
    });

    it('does not audit per row, because the import records the batch once', async () => {
      await service.createManyFromImport(userId, rows, importBatchId, session);

      expect(auditLog.record).not.toHaveBeenCalled();
    });
  });

  describe('removing an expense', () => {
    it('answers not found for an expense the caller does not have', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.remove(userId, new Types.ObjectId())).rejects.toBeInstanceOf(NotFoundException);
      expect(periodLocks.assertUnlocked).not.toHaveBeenCalled();
    });

    it('refuses when the month is closed', async () => {
      periodLocks.assertUnlocked.mockRejectedValue(new PeriodLockedException('2026-01'));

      await expect(service.remove(userId, new Types.ObjectId())).rejects.toBeInstanceOf(PeriodLockedException);
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('soft deletes and records what the expense was', async () => {
      repository.findById.mockResolvedValue(buildExpense({ month: '2026-02', amountMinor: 250_000 }));

      await service.remove(userId, new Types.ObjectId());

      expect(repository.softDelete).toHaveBeenCalled();
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditActionEnum.EXPENSE_DELETED,
          before: expect.objectContaining({ month: '2026-02', amountMinor: 250_000 }) as Record<string, unknown>,
        }),
      );
    });
  });

  describe('listing', () => {
    it('turns a month range into an indexed comparison', async () => {
      await service.list(userId, { limit: 50, offset: 0, from: '2026-01', to: '2026-03' });

      expect(repository.list).toHaveBeenCalledWith(userId, { month: { $gte: '2026-01', $lte: '2026-03' } }, 50, 0);
    });

    it('expresses report drill down as one category in one month', async () => {
      await service.list(userId, {
        limit: 50,
        offset: 0,
        from: '2026-01',
        to: '2026-01',
        categoryId: categoryId.toString(),
      });

      expect(repository.list).toHaveBeenCalledWith(userId, { month: { $gte: '2026-01', $lte: '2026-01' }, categoryId }, 50, 0);
    });

    it('passes no month filter when no range is given', async () => {
      await service.list(userId, { limit: 50, offset: 0 });

      expect(repository.list).toHaveBeenCalledWith(userId, {}, 50, 0);
    });

    it('reads back what one import wrote', async () => {
      const importBatchId = new Types.ObjectId();

      await service.list(userId, { limit: 50, offset: 0, importBatchId: importBatchId.toString() });

      expect(repository.list).toHaveBeenCalledWith(userId, { importBatchId }, 50, 0);
    });

    it('returns the shared paginated envelope without leaking the owner', async () => {
      const result = await service.list(userId, { limit: 50, offset: 0 });

      expect(result.pagination).toEqual({ limit: 50, offset: 0, total: 1 });
      expect(result.items[0]).not.toHaveProperty('userId');
    });
  });
});
