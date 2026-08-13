import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuditActionEnum, AuditLogService } from '@modules/audit-log';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';
import { toCategorySlug } from './categories.util';
import { CATEGORY_CATALOGUE } from './category-catalogue';
import { CategoryDocument } from './schemas/category.schema';

/** Stand in for a stored category. */
const buildCategory = (overrides: Partial<CategoryDocument> = {}): CategoryDocument =>
  ({
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    name: 'Cloud Hosting',
    slug: 'cloud-hosting',
    archivedAt: null,
    deletedAt: null,
    ...overrides,
  }) as unknown as CategoryDocument;

describe('toCategorySlug', () => {
  it.each([
    ['Cloud Hosting', 'cloud-hosting'],
    ['cloud hosting', 'cloud-hosting'],
    ['  Cloud   Hosting  ', 'cloud-hosting'],
    ['Cloud/Hosting', 'cloud-hosting'],
    ['R&D', 'r-d'],
    ['Payroll', 'payroll'],
  ])('normalises %p to %p', (name: string, expected: string) => {
    expect(toCategorySlug(name)).toBe(expected);
  });

  it('collapses names that differ only in case or spacing to the same key', () => {
    // This is the whole point: two categories that look identical in a picker
    // would split the same spend across both in a report.
    expect(toCategorySlug('Cloud Hosting')).toBe(toCategorySlug('cloud  hosting'));
  });

  it('returns an empty key for a name with nothing to normalise', () => {
    expect(toCategorySlug('---')).toBe('');
  });
});

describe('CATEGORY_CATALOGUE', () => {
  it('holds between 30 and 50 entries', () => {
    expect(CATEGORY_CATALOGUE.length).toBeGreaterThanOrEqual(30);
    expect(CATEGORY_CATALOGUE.length).toBeLessThanOrEqual(50);
  });

  it('has no two entries that normalise to the same key', () => {
    const slugs = CATEGORY_CATALOGUE.map((name) => toCategorySlug(name));

    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('CategoriesService', () => {
  const userId = new Types.ObjectId();
  let repository: jest.Mocked<
    Pick<
      CategoriesRepository,
      | 'listVisible'
      | 'findVisibleById'
      | 'findVisibleBySlug'
      | 'findOwnedById'
      | 'ownsSlug'
      | 'create'
      | 'update'
      | 'softDelete'
      | 'countShared'
    >
  >;
  let auditLog: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let service: CategoriesService;

  beforeEach(() => {
    repository = {
      listVisible: jest.fn().mockResolvedValue({ categories: [buildCategory()], total: 1 }),
      findVisibleById: jest.fn().mockResolvedValue(buildCategory()),
      findVisibleBySlug: jest.fn().mockResolvedValue(buildCategory()),
      findOwnedById: jest.fn().mockResolvedValue(buildCategory()),
      ownsSlug: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue(buildCategory()),
      update: jest.fn().mockResolvedValue(buildCategory()),
      softDelete: jest.fn().mockResolvedValue(true),
      countShared: jest.fn().mockResolvedValue(CATEGORY_CATALOGUE.length),
    };

    auditLog = { record: jest.fn() };

    service = new CategoriesService(repository as unknown as CategoriesRepository, auditLog as unknown as AuditLogService);
  });

  describe('seeding the shared catalogue', () => {
    it('does nothing when the catalogue is already present', async () => {
      await service.onApplicationBootstrap();

      expect(repository.create).not.toHaveBeenCalled();
    });

    it('seeds every entry with no owner when the catalogue is missing', async () => {
      repository.countShared.mockResolvedValue(0);

      await service.onApplicationBootstrap();

      expect(repository.create).toHaveBeenCalledTimes(CATEGORY_CATALOGUE.length);
      expect(repository.create).toHaveBeenCalledWith(null, expect.any(String), expect.any(String));
    });

    it('tolerates another instance seeding at the same time', async () => {
      repository.countShared.mockResolvedValue(0);
      repository.create.mockRejectedValue({ code: 11_000 });

      // A duplicate key means the row already exists, which is the desired end
      // state, so the boot must not fail.
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });

    it('does not swallow a failure that is not a duplicate', async () => {
      repository.countShared.mockResolvedValue(0);
      repository.create.mockRejectedValue(new Error('connection lost'));

      await expect(service.onApplicationBootstrap()).rejects.toThrow('connection lost');
    });
  });

  describe('create', () => {
    it('stores the name as written and the normalised key beside it', async () => {
      await service.create(userId, { name: '  Cloud Hosting  ' });

      expect(repository.create).toHaveBeenCalledWith(userId, 'Cloud Hosting', 'cloud-hosting');
    });

    it('rejects a name the caller already uses, whatever its capitalisation', async () => {
      repository.ownsSlug.mockResolvedValue(true);

      await expect(service.create(userId, { name: 'cloud  HOSTING' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a name with nothing to normalise', async () => {
      await expect(service.create(userId, { name: '---' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('records the creation', async () => {
      await service.create(userId, { name: 'Cloud Hosting' }, 'req-1');

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditActionEnum.CATEGORY_CREATED, requestId: 'req-1' }),
      );
    });
  });

  describe('update', () => {
    it('answers not found for a category the caller does not own', async () => {
      // A shared catalogue entry is never owned, so this is also how an attempt
      // to rename one is answered.
      repository.findOwnedById.mockResolvedValue(null);

      await expect(service.update(userId, new Types.ObjectId(), { name: 'New' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a rename that collides with another of the caller’s categories', async () => {
      repository.findOwnedById.mockResolvedValue(buildCategory({ slug: 'payroll' }));
      repository.ownsSlug.mockResolvedValue(true);

      await expect(service.update(userId, new Types.ObjectId(), { name: 'Cloud Hosting' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('allows a rename that only changes capitalisation, since the key is unchanged', async () => {
      repository.findOwnedById.mockResolvedValue(buildCategory({ slug: 'cloud-hosting' }));
      repository.ownsSlug.mockResolvedValue(true);

      await expect(service.update(userId, new Types.ObjectId(), { name: 'CLOUD HOSTING' })).resolves.toBeDefined();
    });

    it('sets an archive time when archiving and clears it when restoring', async () => {
      const categoryId = new Types.ObjectId();

      await service.update(userId, categoryId, { archived: true });
      expect(repository.update).toHaveBeenCalledWith(userId, categoryId, { archivedAt: expect.any(Date) as Date });

      await service.update(userId, categoryId, { archived: false });
      expect(repository.update).toHaveBeenCalledWith(userId, categoryId, { archivedAt: null });
    });

    it('records both sides of the change', async () => {
      repository.findOwnedById.mockResolvedValue(buildCategory({ name: 'Old name' }));
      repository.update.mockResolvedValue(buildCategory({ name: 'New name' }));

      await service.update(userId, new Types.ObjectId(), { name: 'New name' });

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditActionEnum.CATEGORY_UPDATED,
          before: { name: 'Old name', archived: false },
          after: { name: 'New name', archived: false },
        }),
      );
    });
  });

  describe('remove', () => {
    it('answers not found for a category the caller does not own', async () => {
      repository.findOwnedById.mockResolvedValue(null);

      await expect(service.remove(userId, new Types.ObjectId())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('soft deletes and records the last known state', async () => {
      repository.findOwnedById.mockResolvedValue(buildCategory({ name: 'Doomed' }));

      await service.remove(userId, new Types.ObjectId());

      expect(repository.softDelete).toHaveBeenCalled();
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditActionEnum.CATEGORY_DELETED,
          before: { name: 'Doomed', archived: false },
        }),
      );
    });
  });

  describe('resolveByName', () => {
    it('matches on the normalised key, so a spreadsheet cell resolves', async () => {
      await service.resolveByName(userId, '  CLOUD   hosting ');

      expect(repository.findVisibleBySlug).toHaveBeenCalledWith(userId, 'cloud-hosting');
    });
  });
});
