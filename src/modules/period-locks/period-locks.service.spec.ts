import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DataVersionService } from '@common/cache';
import { AuditActionEnum, AuditLogService } from '@modules/audit-log';
import { PeriodLockedException } from './period-locked.exception';
import { PeriodLocksRepository } from './period-locks.repository';
import { PeriodLocksService } from './period-locks.service';

describe('PeriodLocksService', () => {
  const userId = new Types.ObjectId();
  let repository: jest.Mocked<Pick<PeriodLocksRepository, 'isLocked' | 'findLockedAmong' | 'lock' | 'unlock' | 'listInRange'>>;
  let auditLog: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let dataVersion: jest.Mocked<Pick<DataVersionService, 'bump'>>;
  let service: PeriodLocksService;

  beforeEach(() => {
    repository = {
      isLocked: jest.fn().mockResolvedValue(false),
      findLockedAmong: jest.fn().mockResolvedValue([]),
      lock: jest.fn().mockResolvedValue(true),
      unlock: jest.fn().mockResolvedValue(true),
      listInRange: jest.fn().mockResolvedValue([]),
    };

    auditLog = { record: jest.fn() };
    dataVersion = { bump: jest.fn() };

    service = new PeriodLocksService(
      repository as unknown as PeriodLocksRepository,
      auditLog as unknown as AuditLogService,
      dataVersion as unknown as DataVersionService,
    );
  });

  describe('assertUnlocked', () => {
    it('allows a write to an open month', async () => {
      await expect(service.assertUnlocked(userId, '2026-01')).resolves.toBeUndefined();
    });

    it('rejects a write to a closed month', async () => {
      repository.isLocked.mockResolvedValue(true);

      await expect(service.assertUnlocked(userId, '2026-01')).rejects.toBeInstanceOf(PeriodLockedException);
    });

    it('names the month in the error details, so a client need not parse the message', async () => {
      repository.isLocked.mockResolvedValue(true);

      const error = await service.assertUnlocked(userId, '2026-03').catch((thrown: PeriodLockedException) => thrown);

      expect((error as PeriodLockedException).details).toEqual({ month: '2026-03' });
      expect((error as PeriodLockedException).getStatus()).toBe(423);
    });

    it('passes the session through, so the check and the write it guards see one snapshot', async () => {
      const session = { id: 'session' } as never;

      await service.assertUnlocked(userId, '2026-01', session);

      expect(repository.isLocked).toHaveBeenCalledWith(userId, '2026-01', session);
    });
  });

  describe('assertMoveAllowed', () => {
    it('rejects moving a record out of a closed month', async () => {
      // The case a naive implementation misses: only the destination is checked,
      // so a user empties a closed period by moving its records elsewhere.
      repository.isLocked.mockImplementation(async (_user, month: string) => await Promise.resolve(month === '2026-01'));

      await expect(service.assertMoveAllowed(userId, '2026-01', '2026-02')).rejects.toBeInstanceOf(PeriodLockedException);
    });

    it('rejects moving a record into a closed month', async () => {
      repository.isLocked.mockImplementation(async (_user, month: string) => await Promise.resolve(month === '2026-02'));

      await expect(service.assertMoveAllowed(userId, '2026-01', '2026-02')).rejects.toBeInstanceOf(PeriodLockedException);
    });

    it('allows a move between two open months', async () => {
      await expect(service.assertMoveAllowed(userId, '2026-01', '2026-02')).resolves.toBeUndefined();
    });

    it('checks the month once when it is not actually moving', async () => {
      await service.assertMoveAllowed(userId, '2026-01', '2026-01');

      expect(repository.isLocked).toHaveBeenCalledTimes(1);
    });
  });

  describe('assertAllUnlocked', () => {
    it('allows a batch where every month is open', async () => {
      await expect(service.assertAllUnlocked(userId, ['2026-01', '2026-02'])).resolves.toBeUndefined();
    });

    it('checks the whole batch in one query, with duplicates removed', async () => {
      await service.assertAllUnlocked(userId, ['2026-01', '2026-01', '2026-02']);

      expect(repository.findLockedAmong).toHaveBeenCalledTimes(1);
      expect(repository.findLockedAmong).toHaveBeenCalledWith(userId, ['2026-01', '2026-02'], undefined);
    });

    it('reports the earliest locked month, so the message does not depend on document order', async () => {
      repository.findLockedAmong.mockResolvedValue(['2026-05', '2026-02']);

      const error = await service
        .assertAllUnlocked(userId, ['2026-02', '2026-05'])
        .catch((thrown: PeriodLockedException) => thrown);

      expect((error as PeriodLockedException).details).toEqual({ month: '2026-02' });
    });
  });

  describe('lock', () => {
    it('expands a quarter into its three calendar months', async () => {
      await service.lock(userId, { quarter: '2026-Q1' });

      expect(repository.lock).toHaveBeenCalledTimes(3);
      expect(repository.lock).toHaveBeenCalledWith(userId, '2026-01');
      expect(repository.lock).toHaveBeenCalledWith(userId, '2026-03');
    });

    it('locks the months supplied, deduplicated and in order', async () => {
      await service.lock(userId, { months: ['2026-03', '2026-01', '2026-03'] });

      expect(repository.lock).toHaveBeenCalledTimes(2);
      expect(repository.lock).toHaveBeenNthCalledWith(1, userId, '2026-01');
    });

    it('reports only the months this call closed', async () => {
      repository.lock.mockImplementation(async (_user, month: string) => await Promise.resolve(month === '2026-02'));

      await expect(service.lock(userId, { months: ['2026-01', '2026-02'] })).resolves.toEqual(['2026-02']);
    });

    it('does not record an audit entry for a month that was already closed', async () => {
      repository.lock.mockResolvedValue(false);

      await service.lock(userId, { months: ['2026-01'] });

      expect(auditLog.record).not.toHaveBeenCalled();
    });

    it('records each month it closed', async () => {
      await service.lock(userId, { months: ['2026-01'] }, 'req-1');

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditActionEnum.PERIOD_LOCKED, after: { month: '2026-01' }, requestId: 'req-1' }),
      );
    });

    it('rejects a request that supplies neither months nor a quarter', async () => {
      await expect(service.lock(userId, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a malformed month', async () => {
      await expect(service.lock(userId, { months: ['2026-13'] })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('unlock', () => {
    it('reopens a closed month and records it', async () => {
      await service.unlock(userId, '2026-01', 'req-1');

      expect(repository.unlock).toHaveBeenCalledWith(userId, '2026-01');
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditActionEnum.PERIOD_UNLOCKED, before: { month: '2026-01' } }),
      );
    });

    it('answers not found for a month that is not closed', async () => {
      repository.unlock.mockResolvedValue(false);

      await expect(service.unlock(userId, '2026-01')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a malformed month before touching the database', async () => {
      await expect(service.unlock(userId, 'January')).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.unlock).not.toHaveBeenCalled();
    });
  });
});
