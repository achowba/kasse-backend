import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AUDIT_BUFFER_LIMIT } from './audit-log.constants';
import { AuditActionEnum, AuditEntityEnum } from './audit-log.enums';
import { AuditLogRepository } from './audit-log.repository';
import { AuditLogService } from './audit-log.service';
import { AuditEntryDocument } from './schemas/audit-entry.schema';

/** Stand in for a stored entry. */
const buildEntry = (): AuditEntryDocument =>
  ({
    _id: new Types.ObjectId(),
    action: AuditActionEnum.PLAN_UPDATED,
    entity: AuditEntityEnum.PLAN,
    entityId: new Types.ObjectId(),
    before: { targetMinor: 500_000 },
    after: { targetMinor: 600_000 },
    requestId: 'req-1',
    at: new Date('2026-01-15T10:04:11.212Z'),
  }) as unknown as AuditEntryDocument;

describe('AuditLogService', () => {
  const userId = new Types.ObjectId();
  let repository: jest.Mocked<Pick<AuditLogRepository, 'append' | 'appendMany' | 'list'>>;
  let service: AuditLogService;

  beforeEach(() => {
    repository = {
      append: jest.fn().mockResolvedValue(buildEntry()),
      appendMany: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue({ entries: [buildEntry()], total: 1 }),
    };

    service = new AuditLogService(repository as unknown as AuditLogRepository);
  });

  describe('accepting an entry', () => {
    it('returns without waiting for the write, so a slow trail cannot slow a change', () => {
      service.record({ userId, action: AuditActionEnum.PLAN_CREATED, entity: AuditEntityEnum.PLAN });

      // The caller has already returned while nothing has been written yet. That
      // is the whole point: the change it describes is committed either way.
      expect(repository.appendMany).not.toHaveBeenCalled();
    });

    it('writes what it accepted once flushed', async () => {
      const entityId = new Types.ObjectId();

      service.record({
        userId,
        action: AuditActionEnum.PLAN_UPDATED,
        entity: AuditEntityEnum.PLAN,
        entityId,
        before: { targetMinor: 500_000 },
        after: { targetMinor: 600_000 },
        requestId: 'req-1',
      });

      await service.flush();

      expect(repository.appendMany).toHaveBeenCalledWith([
        expect.objectContaining({
          userId,
          action: AuditActionEnum.PLAN_UPDATED,
          entity: AuditEntityEnum.PLAN,
          entityId,
          before: { targetMinor: 500_000 },
          after: { targetMinor: 600_000 },
          requestId: 'req-1',
        }),
      ]);
    });

    it('writes a burst as one batch rather than one insert each', async () => {
      service.record({ userId, action: AuditActionEnum.PLAN_CREATED, entity: AuditEntityEnum.PLAN });
      service.record({ userId, action: AuditActionEnum.EXPENSE_CREATED, entity: AuditEntityEnum.EXPENSE });
      service.record({ userId, action: AuditActionEnum.PERIOD_LOCKED, entity: AuditEntityEnum.PERIOD_LOCK });

      await service.flush();

      expect(repository.appendMany).toHaveBeenCalledTimes(1);
      expect(repository.appendMany.mock.calls[0]?.[0]).toHaveLength(3);
    });

    it('records a creation with no before state', async () => {
      service.record({
        userId,
        action: AuditActionEnum.PLAN_CREATED,
        entity: AuditEntityEnum.PLAN,
        after: { targetMinor: 500_000 },
      });

      await service.flush();

      expect(repository.appendMany).toHaveBeenCalledWith([expect.objectContaining({ before: null })]);
    });

    it('records a deletion with no after state', async () => {
      service.record({
        userId,
        action: AuditActionEnum.PLAN_DELETED,
        entity: AuditEntityEnum.PLAN,
        before: { targetMinor: 500_000 },
      });

      await service.flush();

      expect(repository.appendMany).toHaveBeenCalledWith([expect.objectContaining({ after: null })]);
    });

    it('stamps the time the change happened, not the time it was written', async () => {
      service.record({ userId, action: AuditActionEnum.PERIOD_LOCKED, entity: AuditEntityEnum.PERIOD_LOCK });

      await service.flush();

      expect(repository.appendMany).toHaveBeenCalledWith([expect.objectContaining({ at: expect.any(Date) as Date })]);
    });

    it('never throws at the caller, because the change it describes already committed', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      repository.appendMany.mockRejectedValue(new Error('mongo is down'));

      expect(() => {
        service.record({ userId, action: AuditActionEnum.PLAN_CREATED, entity: AuditEntityEnum.PLAN });
      }).not.toThrow();

      await expect(service.flush()).resolves.toBeUndefined();
    });

    it('logs an entry it could not write, so the trail survives in the logs', async () => {
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      repository.appendMany.mockRejectedValue(new Error('mongo is down'));

      service.record({ userId, action: AuditActionEnum.PLAN_CREATED, entity: AuditEntityEnum.PLAN });
      await service.flush();

      expect(logged).toHaveBeenCalledWith(
        expect.objectContaining({ entries: expect.any(Array) as unknown[] }),
        expect.stringContaining('could not be written'),
      );
    });

    it('refuses an entry once the buffer is full rather than growing without bound', async () => {
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      for (let index = 0; index <= AUDIT_BUFFER_LIMIT; index += 1) {
        service.record({ userId, action: AuditActionEnum.PLAN_CREATED, entity: AuditEntityEnum.PLAN });
      }

      expect(logged).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('buffer is full'));

      await service.flush();

      expect(repository.appendMany.mock.calls.flatMap((call) => call[0])).toHaveLength(AUDIT_BUFFER_LIMIT);
    });
  });

  describe('concurrent flushes', () => {
    it('waits for a drain already in flight rather than returning while it is still writing', async () => {
      let releaseWrite = (): void => undefined;
      repository.appendMany.mockReturnValue(
        new Promise<void>((resolve) => {
          releaseWrite = (): void => {
            resolve();
          };
        }),
      );

      service.record({ userId, action: AuditActionEnum.PLAN_CREATED, entity: AuditEntityEnum.PLAN });

      const first = service.flush();
      let secondResolved = false;
      const second = service.flush().then(() => {
        secondResolved = true;
      });

      await Promise.resolve();

      // The second caller must still be waiting. Resolving here would tell it
      // the buffer is empty while the write is in fact still in flight, which
      // is the race the trail's read endpoint calls flush to avoid.
      expect(secondResolved).toBe(false);

      releaseWrite();
      await Promise.all([first, second]);

      expect(secondResolved).toBe(true);
    });

    it('does not write the same entry twice when two callers flush at once', async () => {
      service.record({ userId, action: AuditActionEnum.PLAN_CREATED, entity: AuditEntityEnum.PLAN });

      await Promise.all([service.flush(), service.flush()]);

      expect(repository.appendMany.mock.calls.flatMap((call) => call[0])).toHaveLength(1);
    });
  });

  describe('writing inside a transaction', () => {
    it('uses the session, so a rolled back change leaves no entry claiming it happened', async () => {
      const session = { id: 'session' } as never;

      await service.recordWithin(
        { userId, action: AuditActionEnum.IMPORT_COMPLETED, entity: AuditEntityEnum.IMPORT_BATCH },
        session,
      );

      expect(repository.append).toHaveBeenCalledWith(userId, expect.anything(), session);
    });

    it('writes immediately rather than buffering, since the transaction cannot wait', async () => {
      const session = { id: 'session' } as never;

      await service.recordWithin(
        { userId, action: AuditActionEnum.IMPORT_COMPLETED, entity: AuditEntityEnum.IMPORT_BATCH },
        session,
      );

      expect(repository.append).toHaveBeenCalledTimes(1);
      expect(repository.appendMany).not.toHaveBeenCalled();
    });
  });

  describe('shutting down', () => {
    it('writes anything still buffered, so a normal deploy loses nothing', async () => {
      service.record({ userId, action: AuditActionEnum.PLAN_CREATED, entity: AuditEntityEnum.PLAN });

      await service.onApplicationShutdown();

      expect(repository.appendMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('list', () => {
    it('flushes first, so a client reading the trail sees the change it just made', async () => {
      service.record({ userId, action: AuditActionEnum.PLAN_CREATED, entity: AuditEntityEnum.PLAN });

      await service.list(userId, { limit: 50, offset: 0 });

      expect(repository.appendMany).toHaveBeenCalled();
    });

    it('returns the entries in the shared paginated envelope', async () => {
      const result = await service.list(userId, { limit: 50, offset: 0 });

      expect(result.items).toHaveLength(1);
      expect(result.pagination).toEqual({ limit: 50, offset: 0, total: 1 });
    });

    it('passes only the filters that were supplied', async () => {
      await service.list(userId, { limit: 10, offset: 0, entity: AuditEntityEnum.EXPENSE });

      expect(repository.list).toHaveBeenCalledWith(userId, { entity: AuditEntityEnum.EXPENSE }, 10, 0);
    });

    it('converts a record filter into an identifier', async () => {
      const entityId = new Types.ObjectId();

      await service.list(userId, { limit: 10, offset: 0, entityId: entityId.toString() });

      expect(repository.list).toHaveBeenCalledWith(userId, { entityId }, 10, 0);
    });

    it('never exposes the stored document directly', async () => {
      const result = await service.list(userId, { limit: 50, offset: 0 });

      expect(result.items[0]).not.toHaveProperty('userId');
      expect(result.items[0]).not.toHaveProperty('deletedAt');
    });
  });
});
