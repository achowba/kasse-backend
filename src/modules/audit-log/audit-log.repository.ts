import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, QueryFilter, Types } from 'mongoose';
import { BaseTenantRepository } from '@common/database';
import { AuditEntry, AuditEntryDocument } from './schemas/audit-entry.schema';

/**
 * Data access for the audit trail.
 *
 * @remarks
 * Append and read only. The inherited `updateOne`, `softDelete`, and `restore`
 * exist on the base class but are never called for this collection, and nothing
 * here adds a way to edit an entry. An audit trail that can be rewritten is not
 * evidence of anything.
 */
@Injectable()
export class AuditLogRepository extends BaseTenantRepository<AuditEntry> {
  constructor(@InjectModel(AuditEntry.name) model: Model<AuditEntry>) {
    super(model);
  }

  /**
   * Reads a page of the trail, newest first.
   *
   * @param userId - The authenticated caller.
   * @param filter - Extra conditions, such as a single entity.
   * @param limit - How many entries to return.
   * @param offset - How many entries to skip.
   * @returns The entries and the total matching the filter.
   */
  async list(
    userId: Types.ObjectId,
    filter: QueryFilter<AuditEntry>,
    limit: number,
    offset: number,
  ): Promise<{ entries: AuditEntryDocument[]; total: number }> {
    const [entries, total] = await Promise.all([
      this.find(userId, filter, { sort: { at: -1 }, skip: offset, limit }),
      this.count(userId, filter),
    ]);

    return { entries, total };
  }

  /**
   * Appends an entry.
   *
   * @param userId - The account the change belongs to.
   * @param entry - The entry to append.
   * @param session - Optional transaction session, so the record and its audit entry commit together.
   * @returns The stored entry.
   */
  async append(userId: Types.ObjectId, entry: Partial<AuditEntry>, session?: ClientSession): Promise<AuditEntryDocument> {
    return await this.create(userId, entry, session);
  }

  /**
   * Appends a batch of entries in one insert.
   *
   * @remarks
   * The batch spans accounts, because the dispatcher buffers every request this
   * instance served rather than one user's. That is why this does not go through
   * the tenant scoped helpers: each entry already carries the account it belongs
   * to, and there is no single owner to scope the write to.
   *
   * Unordered, so one rejected entry does not discard the rest of the batch. The
   * trail is append only and the entries are independent, so there is nothing a
   * later entry depends on an earlier one for.
   *
   * @param entries - The entries to append, each carrying its own `userId`.
   */
  async appendMany(entries: Partial<AuditEntry>[]): Promise<void> {
    await this.model.insertMany(entries, { ordered: false });
  }
}
