import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ClientSession, QueryFilter, Types } from 'mongoose';
import { IPaginatedResponse, toPaginatedResponse } from '@common/pagination';
import { AUDIT_BUFFER_LIMIT, AUDIT_FLUSH_BATCH_SIZE } from './audit-log.constants';
import { AuditActionEnum, AuditEntityEnum } from './audit-log.enums';
import { AuditLogRepository } from './audit-log.repository';
import { AuditEntryResponseDTO } from './dto/audit-entry-response.dto';
import { ListAuditEntriesQueryDTO } from './dto/list-audit-entries.query.dto';
import { AuditEntry } from './schemas/audit-entry.schema';

/**
 * One change to record.
 *
 * @remarks
 * Carries no transaction session. A dispatched entry is written after the
 * request that produced it has returned, by which time any session is closed, so
 * accepting one here would be an invitation to a bug. The transactional path is
 * {@link AuditLogService.recordWithin}, which takes the session explicitly.
 *
 * @property userId - The account the change belongs to.
 * @property action - What happened.
 * @property entity - What kind of record it happened to.
 * @property entityId - Which record, where there is a single subject.
 * @property before - State before the change. Omitted on a creation.
 * @property after - State after the change. Omitted on a deletion.
 * @property requestId - The request that made the change.
 */
export interface IRecordAuditEntry {
  userId: Types.ObjectId;
  action: AuditActionEnum;
  entity: AuditEntityEnum;
  entityId?: Types.ObjectId;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  requestId?: string;
}

/**
 * Records and reads the trail of changes to financial data.
 *
 * @remarks
 * Every mutation of a plan, an expense, a category, or a lock writes here. The
 * trail is append only, and is the reason a soft deleted record is still useful:
 * the entry says what the record looked like before it went.
 *
 * **Why the write is dispatched.** The change the entry describes has already
 * committed by the time this is called. Awaiting the entry would put a second
 * round trip on the response path, and worse, a failure to write it would turn a
 * successful change into a 500, which a retrying client would then duplicate.
 * Neither is acceptable, so entries are buffered and written just after the
 * response.
 *
 * **What that costs.** A `SIGKILL` with entries still buffered loses them. A
 * normal shutdown does not, because the buffer is flushed on the shutdown hook,
 * and a write that cannot reach the database is logged in full at error level so
 * the trail survives in the logs. A durable broker is the production answer to
 * the remaining gap, and the README states the volume at which it is worth
 * introducing one.
 *
 * **The exception.** A change already running in a transaction uses
 * {@link AuditLogService.recordWithin}, which writes the entry inside that same
 * transaction. There the entry costs no extra round trip and a rolled back change
 * leaves no entry claiming it happened, so there is nothing to trade away.
 */
@Injectable()
export class AuditLogService implements OnApplicationShutdown {
  private readonly logger = new Logger(AuditLogService.name);

  /** Entries accepted but not yet written. */
  private readonly buffer: Partial<AuditEntry>[] = [];

  /** The drain in flight, so a concurrent caller joins it rather than starting a second one. */
  private drain: Promise<void> | null = null;

  /** True when a drain is already queued for the next tick, so a burst schedules one. */
  private scheduled = false;

  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  /**
   * Accepts an entry and returns immediately.
   *
   * @remarks
   * Never throws. The caller has already made the change this describes, so
   * there is no useful way for it to react to a failure here, and raising one
   * would misreport a successful change as a failed one.
   *
   * @steps
   * 1. Refuse the entry when the buffer is full, logging it in full so it is not
   *    lost silently. A full buffer means the database is unreachable, which is
   *    the moment the trail matters most.
   * 2. Buffer the entry.
   * 3. Queue a drain for the next tick, unless one is already queued or running.
   *
   * @param entry - The change to record.
   */
  record(entry: IRecordAuditEntry): void {
    const document = this.toDocument(entry);

    if (this.buffer.length >= AUDIT_BUFFER_LIMIT) {
      this.logger.error({ entry: document }, 'audit buffer is full, entry written to the log instead');

      return;
    }

    this.buffer.push(document);
    this.scheduleDrain();
  }

  /**
   * Writes an entry inside a transaction.
   *
   * @remarks
   * Used where the change itself is transactional, such as a CSV import. The
   * entry commits with the change or not at all, and costs no extra round trip
   * because the transaction is open regardless.
   *
   * @param entry - The change to record.
   * @param session - The transaction the change is running in.
   */
  async recordWithin(entry: IRecordAuditEntry, session: ClientSession): Promise<void> {
    await this.auditLogRepository.append(entry.userId, this.toDocument(entry), session);
  }

  /**
   * Writes every buffered entry.
   *
   * @remarks
   * Public because two callers need the buffer empty rather than merely
   * scheduled: the shutdown hook, and the trail's own read endpoint, which would
   * otherwise be able to miss a change the same instance had just accepted.
   *
   * @steps
   * 1. Wait for any drain already in flight. Returning early instead would tell
   *    the caller the buffer is empty when it is only in the process of
   *    emptying, which is precisely the race the read endpoint calls this to
   *    avoid.
   * 2. Return when there is nothing left, so the common case costs no work.
   * 3. Otherwise start a drain and publish it, so a caller arriving meanwhile
   *    joins this one rather than writing the same entries twice.
   */
  async flush(): Promise<void> {
    const inFlight = this.drain;

    if (inFlight !== null) {
      await inFlight;
    }

    if (this.buffer.length === 0) {
      return;
    }

    const drain = this.drainBuffer();

    this.drain = drain;

    try {
      await drain;
    } finally {
      // Only clear it when it is still this drain. A later caller may already
      // have published its own, and nulling that one would let a third caller
      // start a duplicate.
      if (this.drain === drain) {
        this.drain = null;
      }
    }
  }

  /**
   * Writes the buffer out in batches.
   *
   * @remarks
   * Never rejects. A failed batch is logged in full and the drain continues:
   * retrying would loop forever against a database that is down, and dropping
   * silently would leave a gap nobody could see.
   *
   * The loop re-reads the buffer length each pass, so entries that arrive while
   * a batch is being written are included in this drain rather than waiting for
   * the next one.
   */
  private async drainBuffer(): Promise<void> {
    while (this.buffer.length > 0) {
      const batch = this.buffer.splice(0, AUDIT_FLUSH_BATCH_SIZE);

      try {
        await this.auditLogRepository.appendMany(batch);
      } catch (error: unknown) {
        this.logger.error({ err: error, entries: batch }, 'audit entries could not be written, logged instead');
      }
    }
  }

  /**
   * Writes anything still buffered before the process exits.
   *
   * @remarks
   * Registered through Nest's shutdown hooks, which the server enables. A rolling
   * deploy or a container stop therefore loses nothing.
   */
  async onApplicationShutdown(): Promise<void> {
    await this.flush();
  }

  /**
   * Reads a page of the caller's trail, newest first.
   *
   * @remarks
   * Flushes first, so a client that reads the trail straight after making a
   * change sees that change. Without it, dispatching the write would make the
   * endpoint intermittently miss the most recent entry, which is the one a reader
   * is most likely to be looking for.
   *
   * @param userId - The authenticated caller.
   * @param query - Filters and pagination.
   * @returns The entries, with the total across the whole filtered set.
   */
  async list(userId: Types.ObjectId, query: ListAuditEntriesQueryDTO): Promise<IPaginatedResponse<AuditEntryResponseDTO>> {
    await this.flush();

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

  /**
   * Fills in the fields the collection requires but a caller should not have to
   * supply.
   *
   * @remarks
   * Stamps `at` when the entry is accepted rather than when it is written, so a
   * slow flush does not misreport when the change happened.
   *
   * @param entry - The change to record.
   * @returns The entry as it will be stored.
   */
  private toDocument(entry: IRecordAuditEntry): Partial<AuditEntry> {
    return {
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      requestId: entry.requestId ?? null,
      at: new Date(),
      deletedAt: null,
    };
  }

  /**
   * Queues a drain for the next tick.
   *
   * @remarks
   * `setImmediate` rather than an interval, so entries are written as soon as the
   * event loop is free rather than on a fixed delay, and an idle process holds no
   * timer.
   *
   * The rejection handler is not decoration and `void` would not do instead.
   * Nothing awaits this call, so an error escaping {@link AuditLogService.flush}
   * would become an unhandled rejection, and Node terminates the process on one.
   * Losing the trail is survivable; taking the API down to do it is not.
   */
  private scheduleDrain(): void {
    if (this.scheduled) {
      return;
    }

    this.scheduled = true;

    setImmediate((): void => {
      this.scheduled = false;

      this.flush().catch((error: unknown): void => {
        this.logger.error({ err: error }, 'audit flush failed');
      });
    });
  }
}
