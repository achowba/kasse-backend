import { Model, Types } from 'mongoose';
import { BaseTenantRepository } from './base.repository';
import { TenantOwnedDocument } from './tenant-owned.document';

/**
 * A chainable query double, matching Mongoose's `Query`.
 *
 * @property exec - Resolves the query.
 */
interface IQueryDouble {
  exec: jest.Mock;
}

/**
 * The model methods this repository uses.
 *
 * @property findOne - Reads one document.
 * @property find - Reads many documents.
 * @property countDocuments - Counts documents.
 * @property exists - Reports whether a document matches.
 * @property findOneAndUpdate - Updates and returns a document.
 * @property updateOne - Updates a document in place.
 */
interface IModelDouble {
  findOne: jest.Mock;
  find: jest.Mock;
  countDocuments: jest.Mock;
  exists: jest.Mock;
  findOneAndUpdate: jest.Mock;
  updateOne: jest.Mock;
}

/**
 * Builds a query double that resolves to the given value.
 *
 * @param value - What `exec` resolves to.
 * @returns The query double.
 */
const query = (value: unknown): IQueryDouble => ({ exec: jest.fn().mockResolvedValue(value) });

/**
 * Builds a model double with every method the repository calls.
 *
 * @returns The model double.
 */
const createModel = (): IModelDouble => ({
  findOne: jest.fn().mockReturnValue(query(null)),
  find: jest.fn().mockReturnValue(query([])),
  countDocuments: jest.fn().mockReturnValue(query(0)),
  exists: jest.fn().mockResolvedValue(null),
  findOneAndUpdate: jest.fn().mockReturnValue(query(null)),
  updateOne: jest.fn().mockReturnValue(query({ modifiedCount: 1 })),
});

/** Concrete repository, since the base class is abstract. */
class TestRepository extends BaseTenantRepository<TenantOwnedDocument> {
  constructor(model: Model<TenantOwnedDocument>) {
    super(model);
  }
}

describe('BaseTenantRepository', () => {
  const userId = new Types.ObjectId();
  const otherId = new Types.ObjectId();
  let model: IModelDouble;
  let repository: TestRepository;

  beforeEach(() => {
    model = createModel();
    repository = new TestRepository(model as unknown as Model<TenantOwnedDocument>);
  });

  describe('scoping every read', () => {
    it('scopes findOne to the owner and to live records', async () => {
      await repository.findOne(userId, { month: '2026-01' });

      expect(model.findOne).toHaveBeenCalledWith({ month: '2026-01', userId, deletedAt: null }, null, {
        session: undefined,
      });
    });

    it('scopes findById, so another user id cannot reach the record', async () => {
      await repository.findById(userId, otherId);

      expect(model.findOne).toHaveBeenCalledWith({ _id: otherId, userId, deletedAt: null }, null, { session: undefined });
    });

    it('scopes find', async () => {
      await repository.find(userId, { categoryId: otherId });

      expect(model.find).toHaveBeenCalledWith({ categoryId: otherId, userId, deletedAt: null }, null, {});
    });

    it('scopes count', async () => {
      await repository.count(userId);

      expect(model.countDocuments).toHaveBeenCalledWith({ userId, deletedAt: null });
    });

    it('scopes exists', async () => {
      await repository.exists(userId, { month: '2026-02' });

      expect(model.exists).toHaveBeenCalledWith({ month: '2026-02', userId, deletedAt: null });
    });

    it('scopes updateOne, so an update cannot reach another account or a deleted record', async () => {
      await repository.updateOne(userId, { _id: otherId }, { $set: { targetMinor: 500 } });

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: otherId, userId, deletedAt: null },
        { $set: { targetMinor: 500 } },
        { new: true, runValidators: true, session: undefined },
      );
    });

    it('does not let a caller override the owner through the filter', async () => {
      await repository.findOne(userId, { userId: otherId });

      expect(model.findOne).toHaveBeenCalledWith({ userId, deletedAt: null }, null, { session: undefined });
    });

    it('does not let a caller include deleted records through the filter', async () => {
      await repository.findOne(userId, { deletedAt: { $ne: null } });

      expect(model.findOne).toHaveBeenCalledWith({ userId, deletedAt: null }, null, { session: undefined });
    });
  });

  describe('soft delete', () => {
    it('sets deletedAt instead of removing the record', async () => {
      await repository.softDelete(userId, otherId);

      const [filter, update] = model.updateOne.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];

      expect(filter).toEqual({ _id: otherId, userId, deletedAt: null });
      expect(update).toHaveProperty('$set.deletedAt');
      expect(model.updateOne).toHaveBeenCalledTimes(1);
    });

    it('reports false when nothing live matched', async () => {
      model.updateOne.mockReturnValue(query({ modifiedCount: 0 }));

      await expect(repository.softDelete(userId, otherId)).resolves.toBe(false);
    });

    it('restores only a record that is currently deleted', async () => {
      await repository.restore(userId, otherId);

      const [filter, update] = model.updateOne.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];

      expect(filter).toEqual({ _id: otherId, userId, deletedAt: { $ne: null } });
      expect(update).toEqual({ $set: { deletedAt: null } });
    });
  });

  describe('the audit and restore path', () => {
    it('findByIdIncludingDeleted keeps the owner scope but drops the live filter', async () => {
      await repository.findByIdIncludingDeleted(userId, otherId);

      expect(model.findOne).toHaveBeenCalledWith({ _id: otherId, userId });
    });
  });
});
