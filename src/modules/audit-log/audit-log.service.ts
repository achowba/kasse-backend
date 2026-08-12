import { Injectable } from '@nestjs/common';
import { ClientSession, QueryFilter, Types } from 'mongoose';
import { IPaginatedResponse, toPaginatedResponse } from '@common/pagination';
import { AuditActionEnum, AuditEntityEnum } from './audit-log.enums';
import { AuditLogRepository } from './audit-log.repository';
import { AuditEntryResponseDTO } from './dto/audit-entry-response.dto';
import { ListAuditEntriesQueryDTO } from './dto/list-audit-entries.query.dto';
import { AuditEntry } from './schemas/audit-entry.schema';

/**
 * One change to record.
 *
 * @property userId - The account the change belongs to.
 * @property action - What happened.
 * @property entity - What kind of record it happened to.
 * @property entityId - Which record, where there is a single subject.
 * @property before - State before the change. Omitted on a creation.
 * @property after - State after the change. Omitted on a deletion.
 * @property requestId - The request that made the change.
 * @property session - Transaction session, so the entry commits with the change it describes.
 */
export interface IRecordAuditEntry {
  userId: Types.ObjectId;
  action: AuditActionEnum;
  entity: AuditEntityEnum;
  entityId?: Types.ObjectId;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  requestId?: string;
  session?: ClientSession;
}

/**
 * Records and reads the trail of changes to financial data.
 *
 * @remarks
 * Every mutation of a plan, an actual, a category, or a lock writes here. The
 * trail is append only, and is the reason a soft deleted record is still useful:
 * the entry says what the record looked like before it went.
 *
 * When a change runs in a transaction the entry is written with the same session,
 * so a rolled back change leaves no entry claiming it happened.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  /**
   * Appends an entry to the trail.
   *
   * @param entry - The change to record.
   */
  async record(entry: IRecordAuditEntry): Promise<void> {
    const { userId, session, ...rest } = entry;

    await this.auditLogRepository.append(
      userId,
      {
        ...rest,
        entityId: rest.entityId ?? null,
        before: rest.before ?? null,
        after: rest.after ?? null,
        requestId: rest.requestId ?? null,
        at: new Date(),
      },
      session,
    );
  }

  /**
   * Reads a page of the caller's trail, newest first.
   *
   * @param userId - The authenticated caller.
   * @param query - Filters and pagination.
   * @returns The entries, with the total across the whole filtered set.
   */
  async list(userId: Types.ObjectId, query: ListAuditEntriesQueryDTO): Promise<IPaginatedResponse<AuditEntryResponseDTO>> {
    const filter: QueryFilter<AuditEntry> = {};

    if (query.entity !== undefined) {
      filter.entity = query.entity;
    }

    if (query.action !== undefined) {
      filter.action = query.action;
    }

    if (query.entityId !== undefined) {
      filter.entityId = new Types.ObjectId(query.entityId);
    }

    const { entries, total } = await this.auditLogRepository.list(userId, filter, query.limit, query.offset);

    return toPaginatedResponse(
      entries.map((entry) => AuditEntryResponseDTO.fromDocument(entry)),
      total,
      query,
    );
  }
}
