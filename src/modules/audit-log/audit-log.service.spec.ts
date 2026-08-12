import { Types } from 'mongoose';
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
  let repository: jest.Mocked<Pick<AuditLogRepository, 'append' | 'list'>>;
  let service: AuditLogService;

  beforeEach(() => {
    repository = {
      append: jest.fn().mockResolvedValue(buildEntry()),
      list: jest.fn().mockResolvedValue({ entries: [buildEntry()], total: 1 }),
    };

    service = new AuditLogService(repository as unknown as AuditLogRepository);
  });

  describe('record', () => {
    it('stores both sides of the change, which is what makes the trail answer what changed', async () => {
      const entityId = new Types.ObjectId();

      await service.record({
        userId,
        action: AuditActionEnum.PLAN_UPDATED,
        entity: AuditEntityEnum.PLAN,
        entityId,
        before: { targetMinor: 500_000 },
        after: { targetMinor: 600_000 },
        requestId: 'req-1',
      });

      expect(repository.append).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          action: AuditActionEnum.PLAN_UPDATED,
          entity: AuditEntityEnum.PLAN,
          entityId,
          before: { targetMinor: 500_000 },
          after: { targetMinor: 600_000 },
          requestId: 'req-1',
        }),
        undefined,
      );
    });

    it('records a creation with no before state', async () => {
      await service.record({
        userId,
        action: AuditActionEnum.PLAN_CREATED,
        entity: AuditEntityEnum.PLAN,
        after: { targetMinor: 500_000 },
      });

      expect(repository.append).toHaveBeenCalledWith(userId, expect.objectContaining({ before: null }), undefined);
    });

    it('records a deletion with no after state', async () => {
      await service.record({
        userId,
        action: AuditActionEnum.PLAN_DELETED,
        entity: AuditEntityEnum.PLAN,
        before: { targetMinor: 500_000 },
      });

      expect(repository.append).toHaveBeenCalledWith(userId, expect.objectContaining({ after: null }), undefined);
    });

    it('passes the session through, so the entry commits with the change it describes', async () => {
      const session = { id: 'session' } as never;

      await service.record({
        userId,
        action: AuditActionEnum.PERIOD_LOCKED,
        entity: AuditEntityEnum.PERIOD_LOCK,
        session,
      });

      expect(repository.append).toHaveBeenCalledWith(userId, expect.anything(), session);
    });

    it('stamps the time it happened', async () => {
      await service.record({ userId, action: AuditActionEnum.PERIOD_LOCKED, entity: AuditEntityEnum.PERIOD_LOCK });

      expect(repository.append).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ at: expect.any(Date) as Date }),
        undefined,
      );
    });
  });

  describe('list', () => {
    it('returns the entries in the shared paginated envelope', async () => {
      const result = await service.list(userId, { limit: 50, offset: 0 });

      expect(result.items).toHaveLength(1);
      expect(result.pagination).toEqual({ limit: 50, offset: 0, total: 1 });
    });

    it('passes only the filters that were supplied', async () => {
      await service.list(userId, { limit: 10, offset: 0, entity: AuditEntityEnum.ACTUAL });

      expect(repository.list).toHaveBeenCalledWith(userId, { entity: AuditEntityEnum.ACTUAL }, 10, 0);
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
