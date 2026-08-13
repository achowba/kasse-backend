import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuditActionEnum, AuditLogService } from '@modules/audit-log';
import { CategoriesService } from '@modules/categories';
import { PeriodLockedException, PeriodLocksService } from '@modules/period-locks';
import { PlansRepository } from './plans.repository';
import { PlansService } from './plans.service';
import { PlanDocument } from './schemas/plan.schema';

/** Stand in for a stored target. */
const buildPlan = (overrides: Partial<PlanDocument> = {}): PlanDocument =>
  ({
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    month: '2026-01',
    targetMinor: 500_000,
    deletedAt: null,
    ...overrides,
  }) as unknown as PlanDocument;

describe('PlansService', () => {
  const userId = new Types.ObjectId();
  const categoryId = new Types.ObjectId();
  let repository: jest.Mocked<Pick<PlansRepository, 'findForCell' | 'upsert' | 'findById' | 'updateOne' | 'softDelete' | 'list'>>;
  let periodLocks: jest.Mocked<Pick<PeriodLocksService, 'assertUnlocked'>>;
  let categories: jest.Mocked<Pick<CategoriesService, 'getVisibleById'>>;
  let auditLog: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let service: PlansService;

  beforeEach(() => {
    repository = {
      findForCell: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(buildPlan()),
      findById: jest.fn().mockResolvedValue(buildPlan()),
      updateOne: jest.fn().mockResolvedValue(buildPlan({ targetMinor: 600_000 })),
      softDelete: jest.fn().mockResolvedValue(true),
      list: jest.fn().mockResolvedValue({ plans: [buildPlan()], total: 1 }),
    };

    periodLocks = { assertUnlocked: jest.fn().mockResolvedValue(undefined) };
    categories = { getVisibleById: jest.fn().mockResolvedValue({ _id: categoryId }) };
    auditLog = { record: jest.fn() };

    service = new PlansService(
      repository as unknown as PlansRepository,
      periodLocks as unknown as PeriodLocksService,
      categories as unknown as CategoriesService,
      auditLog as unknown as AuditLogService,
    );
  });

  const input = { categoryId: categoryId.toString(), month: '2026-01', targetMinor: 500_000 };

  describe('setting a target', () => {
    it('checks the lock before anything else, so a closed period is the reason reported', async () => {
      periodLocks.assertUnlocked.mockRejectedValue(new PeriodLockedException('2026-01'));

      await expect(service.upsert(userId, input)).rejects.toBeInstanceOf(PeriodLockedException);

      // Not merely that it failed: that it failed before doing any other work,
      // so the user is not told to fix a category when the real problem is that
      // the month is closed.
      expect(categories.getVisibleById).not.toHaveBeenCalled();
      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('rejects a category the caller cannot use', async () => {
      categories.getVisibleById.mockRejectedValue(new NotFoundException('Category not found.'));

      await expect(service.upsert(userId, input)).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('writes the target for the cell', async () => {
      await service.upsert(userId, input);

      expect(repository.upsert).toHaveBeenCalledWith(userId, categoryId, '2026-01', 500_000);
    });

    it('records a creation when the cell was empty', async () => {
      repository.findForCell.mockResolvedValue(null);

      await service.upsert(userId, input);

      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: AuditActionEnum.PLAN_CREATED }));
    });

    it('records an update, with the previous amount, when the cell was already planned', async () => {
      repository.findForCell.mockResolvedValue(buildPlan({ targetMinor: 400_000 }));

      await service.upsert(userId, input);

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditActionEnum.PLAN_UPDATED, before: { targetMinor: 400_000 } }),
      );
    });

    it('accepts a target of zero, which is not the same as no target', async () => {
      await service.upsert(userId, { ...input, targetMinor: 0 });

      expect(repository.upsert).toHaveBeenCalledWith(userId, categoryId, '2026-01', 0);
    });
  });

  describe('changing an amount', () => {
    it('answers not found for a target the caller does not have', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.update(userId, new Types.ObjectId(), { targetMinor: 1 })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('checks the lock against the target’s own month, not one supplied by the caller', async () => {
      repository.findById.mockResolvedValue(buildPlan({ month: '2026-07' }));

      await service.update(userId, new Types.ObjectId(), { targetMinor: 1 });

      expect(periodLocks.assertUnlocked).toHaveBeenCalledWith(userId, '2026-07');
    });

    it('refuses when the target’s month is closed', async () => {
      periodLocks.assertUnlocked.mockRejectedValue(new PeriodLockedException('2026-01'));

      await expect(service.update(userId, new Types.ObjectId(), { targetMinor: 1 })).rejects.toBeInstanceOf(
        PeriodLockedException,
      );
      expect(repository.updateOne).not.toHaveBeenCalled();
    });

    it('records both amounts', async () => {
      repository.findById.mockResolvedValue(buildPlan({ targetMinor: 500_000 }));

      await service.update(userId, new Types.ObjectId(), { targetMinor: 600_000 });

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ before: { targetMinor: 500_000 }, after: { targetMinor: 600_000 } }),
      );
    });
  });

  describe('removing a target', () => {
    it('refuses when the month is closed', async () => {
      periodLocks.assertUnlocked.mockRejectedValue(new PeriodLockedException('2026-01'));

      await expect(service.remove(userId, new Types.ObjectId())).rejects.toBeInstanceOf(PeriodLockedException);
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('soft deletes and records what the target was', async () => {
      repository.findById.mockResolvedValue(buildPlan({ month: '2026-02', targetMinor: 250_000 }));

      await service.remove(userId, new Types.ObjectId());

      expect(repository.softDelete).toHaveBeenCalled();
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditActionEnum.PLAN_DELETED,
          before: expect.objectContaining({ month: '2026-02', targetMinor: 250_000 }) as Record<string, unknown>,
        }),
      );
    });
  });

  describe('listing', () => {
    it('turns a month range into an indexed comparison', async () => {
      await service.list(userId, { limit: 50, offset: 0, from: '2026-01', to: '2026-03' });

      expect(repository.list).toHaveBeenCalledWith(userId, { month: { $gte: '2026-01', $lte: '2026-03' } }, 50, 0);
    });

    it('supports an open ended range', async () => {
      await service.list(userId, { limit: 50, offset: 0, from: '2026-01' });

      expect(repository.list).toHaveBeenCalledWith(userId, { month: { $gte: '2026-01' } }, 50, 0);
    });

    it('passes no month filter when no range is given', async () => {
      await service.list(userId, { limit: 50, offset: 0 });

      expect(repository.list).toHaveBeenCalledWith(userId, {}, 50, 0);
    });

    it('returns the shared paginated envelope', async () => {
      const result = await service.list(userId, { limit: 50, offset: 0 });

      expect(result.pagination).toEqual({ limit: 50, offset: 0, total: 1 });
      expect(result.items[0]).not.toHaveProperty('userId');
    });
  });
});
