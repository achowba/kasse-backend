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
}
