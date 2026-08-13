import { ClientSession, HydratedDocument, Model, ProjectionType, QueryFilter, QueryOptions, Types, UpdateQuery } from 'mongoose';
import { TenantOwnedDocument } from './tenant-owned.document';

/**
 * Data access for a collection owned by users, with tenancy and soft delete
 * applied to every query.
 *
 * @remarks
 * Two invariants live here rather than in each service, because both fail
 * silently and neither is visible in a diff that omits them:
 *
 * 1. Every query is scoped to the authenticated user. Filtering per handler is
 *    one forgotten line away from returning another account's financial records.
 * 2. Every read excludes soft deleted records. Nothing in this system is hard
 *    deleted, so an unscoped read would resurrect deleted rows in reports.
 *
 * A caller that genuinely needs deleted records asks for them by name through
 * {@link BaseTenantRepository.findByIdIncludingDeleted}, which exists for audit
 * and restore and nothing else.
 *
 * @typeParam TDocument - The document type this repository reads and writes.
 */
export abstract class BaseTenantRepository<TDocument extends TenantOwnedDocument> {
  protected constructor(protected readonly model: Model<TDocument>) {}

  /**
   * Applies the two filters no read may omit.
   *
   * @param userId - The authenticated user.
   * @param filter - Caller supplied conditions.
   * @returns The filter, scoped to the owner and to live records.
   */
  protected scope(userId: Types.ObjectId, filter: QueryFilter<TDocument> = {}): QueryFilter<TDocument> {
    // `deletedAt: null` also matches documents where the field is absent, so a
    // record written before the field existed is still treated as live.
    return { ...filter, userId, deletedAt: null };
  }

  /**
   * Finds one live record owned by the user.
   *
   * @param userId - The authenticated user.
   * @param filter - Conditions to match.
   * @param session - Optional transaction session.
   * @returns The record, or null when there is none.
   */
  async findOne(
    userId: Types.ObjectId,
    filter: QueryFilter<TDocument> = {},
    session?: ClientSession,
  ): Promise<HydratedDocument<TDocument> | null> {
    return await this.model.findOne(this.scope(userId, filter), null, { session }).exec();
  }

  /**
   * Finds one live record by id, owned by the user.
   *
   * @remarks
   * A record belonging to someone else returns null, and the caller answers 404.
   * Distinguishing "not yours" from "does not exist" would confirm that another
   * user's record exists.
   *
   * @param userId - The authenticated user.
   * @param id - The record identifier.
   * @param session - Optional transaction session.
   * @returns The record, or null when there is none.
   */
  async findById(
    userId: Types.ObjectId,
    id: Types.ObjectId,
    session?: ClientSession,
  ): Promise<HydratedDocument<TDocument> | null> {
    return await this.findOne(userId, { _id: id }, session);
  }

  /**
   * Finds a record by id including soft deleted ones.
   *
   * @remarks
   * The only read that sees deleted records. It exists for audit and restore, and
   * is deliberately awkward to reach for so it is not used by accident.
   *
   * @param userId - The authenticated user.
   * @param id - The record identifier.
   * @returns The record, live or deleted, or null when there is none.
   */
  async findByIdIncludingDeleted(userId: Types.ObjectId, id: Types.ObjectId): Promise<HydratedDocument<TDocument> | null> {
    return await this.model.findOne({ _id: id, userId } as QueryFilter<TDocument>).exec();
  }

  /**
   * Finds every live record matching the filter.
   *
   * @param userId - The authenticated user.
   * @param filter - Conditions to match.
   * @param options - Sort, skip, and limit. List endpoints always pass a limit.
   * @param projection - Fields to return. Prefer naming them over fetching whole documents.
   * @returns The matching records.
   */
  async find(
    userId: Types.ObjectId,
    filter: QueryFilter<TDocument> = {},
    options: QueryOptions<TDocument> = {},
    projection: ProjectionType<TDocument> | null = null,
  ): Promise<HydratedDocument<TDocument>[]> {
    return await this.model.find(this.scope(userId, filter), projection, options).exec();
  }

  /**
   * Counts live records matching the filter.
   *
   * @param userId - The authenticated user.
   * @param filter - Conditions to match.
   * @returns The number of matching records.
   */
  async count(userId: Types.ObjectId, filter: QueryFilter<TDocument> = {}): Promise<number> {
    return await this.model.countDocuments(this.scope(userId, filter)).exec();
  }

  /**
   * Reports whether any live record matches.
   *
   * @param userId - The authenticated user.
   * @param filter - Conditions to match.
   * @returns True when at least one record matches.
   */
  async exists(userId: Types.ObjectId, filter: QueryFilter<TDocument>): Promise<boolean> {
    const found = await this.model.exists(this.scope(userId, filter));

    return found !== null;
  }

  /**
   * Creates a record owned by the user.
   *
   * @remarks
   * Stamps `userId` and `deletedAt` here rather than trusting the caller, so a
   * record cannot be created unowned or pre-deleted.
   *
   * @param userId - The authenticated user.
   * @param data - The record to write.
   * @param session - Optional transaction session.
   * @returns The created record.
   */
  async create(userId: Types.ObjectId, data: Partial<TDocument>, session?: ClientSession): Promise<HydratedDocument<TDocument>> {
    const document = new this.model({ ...data, userId, deletedAt: null });

    return await document.save({ session });
  }

  /**
   * Updates one live record owned by the user.
   *
   * @param userId - The authenticated user.
   * @param filter - Conditions identifying the record.
   * @param update - The change to apply.
   * @param session - Optional transaction session.
   * @returns The updated record, or null when nothing matched.
   */
  async updateOne(
    userId: Types.ObjectId,
    filter: QueryFilter<TDocument>,
    update: UpdateQuery<TDocument>,
    session?: ClientSession,
  ): Promise<HydratedDocument<TDocument> | null> {
    return await this.model
      .findOneAndUpdate(this.scope(userId, filter), update, { new: true, runValidators: true, session })
      .exec();
  }

  /**
   * Soft deletes a record.
   *
   * @remarks
   * Sets `deletedAt`. The row survives, because a locked period must keep
   * resolving what it referenced and a mistaken delete must be recoverable
   * without a database restore. Already deleted records do not match, so
   * repeating the call does not overwrite the original deletion time.
   *
   * @param userId - The authenticated user.
   * @param id - The record identifier.
   * @param session - Optional transaction session.
   * @returns True when a live record was deleted, false when there was none.
   */
  async softDelete(userId: Types.ObjectId, id: Types.ObjectId, session?: ClientSession): Promise<boolean> {
    const result = await this.model
      .updateOne(this.scope(userId, { _id: id }), { $set: { deletedAt: new Date() } }, { session })
      .exec();

    return result.modifiedCount > 0;
  }

  /**
   * Restores a soft deleted record.
   *
   * @param userId - The authenticated user.
   * @param id - The record identifier.
   * @param session - Optional transaction session.
   * @returns True when a deleted record was restored.
   */
  async restore(userId: Types.ObjectId, id: Types.ObjectId, session?: ClientSession): Promise<boolean> {
    const result = await this.model
      .updateOne(
        { _id: id, userId, deletedAt: { $ne: null } } as QueryFilter<TDocument>,
        { $set: { deletedAt: null } },
        {
          session,
        },
      )
      .exec();

    return result.modifiedCount > 0;
  }
}
