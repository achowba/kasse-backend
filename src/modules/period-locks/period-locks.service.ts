import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { compareMonths, isValidMonth, quarterMonths } from '@common/month';
import { AuditActionEnum, AuditEntityEnum, AuditLogService } from '@modules/audit-log';
import { CreatePeriodLockDTO } from './dto/create-period-lock.dto';
import { PeriodLockedException } from './period-locked.exception';
import { PeriodLocksRepository } from './period-locks.repository';
import { PeriodLockDocument } from './schemas/period-lock.schema';

/**
 * Closed accounting periods, and the gate that enforces them.
 *
 * @remarks
 * {@link PeriodLocksService.assertUnlocked} is the single place a locked period
 * is enforced. Every path that writes a plan or an expense calls it, including
 * each row of a CSV import. It lives in a service rather than a guard or an
 * interceptor because the month being written is in the body or in the record
 * being changed, not in the route, and because a rule enforced only at the HTTP
 * edge is a rule the import can bypass.
 */
@Injectable()
export class PeriodLocksService {
  constructor(
    private readonly periodLocksRepository: PeriodLocksRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Rejects the write when the month is closed.
   *
   * @steps
   * 1. Read the lock for this account and month.
   * 2. Throw when one exists.
   *
   * @param userId - The account whose period is in question.
   * @param month - The month being written to.
   * @param session - Optional transaction session, so the check and the write it guards read the same snapshot.
   * @throws PeriodLockedException When the month is locked.
   */
  async assertUnlocked(userId: Types.ObjectId, month: string, session?: ClientSession): Promise<void> {
    if (await this.periodLocksRepository.isLocked(userId, month, session)) {
      throw new PeriodLockedException(month);
    }
  }

  /**
   * Rejects a move that touches a closed month at either end.
   *
   * @remarks
   * Moving spend out of a locked period changes that period's total, so it is an
   * edit to it. Checking only the destination would let a user empty a closed
   * month by moving its records elsewhere, which is the edge case a lock exists
   * to prevent.
   *
   * The source month is reported first when both are locked, because that is the
   * one the user did not expect to be blocked by.
   *
   * @steps
   * 1. Check the month the record is leaving.
   * 2. Check the month it is joining, unless the move does not change the month,
   *    in which case the second check would repeat the first.
   *
   * @param userId - The account whose periods are in question.
   * @param fromMonth - The month the record is leaving.
   * @param toMonth - The month the record is moving to.
   * @param session - Optional transaction session.
   * @throws PeriodLockedException When either month is locked.
   */
  async assertMoveAllowed(userId: Types.ObjectId, fromMonth: string, toMonth: string, session?: ClientSession): Promise<void> {
    await this.assertUnlocked(userId, fromMonth, session);

    if (toMonth !== fromMonth) {
      await this.assertUnlocked(userId, toMonth, session);
    }
  }

  /**
   * Rejects a batch of writes when any of their months is closed.
   *
   * @remarks
   * One query for the whole batch. A CSV import spanning a year would otherwise
   * issue a round trip per month before writing anything.
   *
   * @steps
   * 1. Reduce the months to the distinct set, since a file repeats months freely.
   * 2. Ask for the locked ones among them in a single query.
   * 3. Throw naming the earliest, so a file spanning several closed months always
   *    reports the same one.
   *
   * @param userId - The account whose periods are in question.
   * @param months - Every month the batch writes to.
   * @param session - Optional transaction session.
   * @throws PeriodLockedException Naming the earliest locked month, so the message is deterministic.
   */
  async assertAllUnlocked(userId: Types.ObjectId, months: string[], session?: ClientSession): Promise<void> {
    const locked = await this.periodLocksRepository.findLockedAmong(userId, [...new Set(months)], session);

    if (locked.length > 0) {
      throw new PeriodLockedException([...locked].sort(compareMonths)[0] ?? locked[0] ?? '');
    }
  }

  /**
   * Closes one or more periods.
   *
   * @remarks
   * Takes either a list of months or a quarter, which expands to its three
   * months. Locking an already locked month is harmless and leaves the original
   * time alone, so locking a quarter that overlaps a month locked earlier does
   * not rewrite history.
   *
   * @steps
   * 1. Resolve the request into a list of months, expanding a quarter into three.
   * 2. Lock each in turn, collecting only the ones that were not already locked.
   * 3. Audit each newly closed month, so reopening one later has something to be
   *    compared against.
   *
   * @param userId - The account whose periods to close.
   * @param input - The months or the quarter to close.
   * @param requestId - The request making the change.
   * @returns The months that this call closed, excluding any already closed.
   * @throws BadRequestException When neither months nor a quarter is supplied, or a month is malformed.
   */
  async lock(userId: Types.ObjectId, input: CreatePeriodLockDTO, requestId?: string): Promise<string[]> {
    const months = this.resolveMonths(input);
    const newlyLocked: string[] = [];

    for (const month of months) {
      if (await this.periodLocksRepository.lock(userId, month)) {
        newlyLocked.push(month);

        this.auditLogService.record({
          userId,
          action: AuditActionEnum.PERIOD_LOCKED,
          entity: AuditEntityEnum.PERIOD_LOCK,
          after: { month },
          requestId,
        });
      }
    }

    return newlyLocked;
  }

  /**
   * Reopens a period.
   *
   * @steps
   * 1. Validate the month, since it arrives from the path rather than a body and
   *    has had no DTO applied to it.
   * 2. Remove the lock, reporting not found when there was none.
   * 3. Audit the reopening. This is the one removal in the project that is not a
   *    soft delete: an absent row is precisely what "open" means, and a lock
   *    carrying a `deletedAt` would make every lock check read a second field.
   *
   * @param userId - The account whose period to reopen.
   * @param month - The month to reopen.
   * @param requestId - The request making the change.
   * @throws NotFoundException When that month is not locked.
   */
  async unlock(userId: Types.ObjectId, month: string, requestId?: string): Promise<void> {
    if (!isValidMonth(month)) {
      throw new BadRequestException(`Invalid month "${month}". Expected YYYY-MM.`);
    }

    if (!(await this.periodLocksRepository.unlock(userId, month))) {
      throw new NotFoundException(`${month} is not locked.`);
    }

    this.auditLogService.record({
      userId,
      action: AuditActionEnum.PERIOD_UNLOCKED,
      entity: AuditEntityEnum.PERIOD_LOCK,
      before: { month },
      requestId,
    });
  }

  /**
   * Lists closed periods.
   *
   * @param userId - The account whose periods to list.
   * @param from - First month of the range, inclusive.
   * @param to - Last month of the range, inclusive.
   * @returns The locks, oldest first.
   */
  async list(userId: Types.ObjectId, from?: string, to?: string): Promise<PeriodLockDocument[]> {
    return await this.periodLocksRepository.listInRange(userId, from, to);
  }

  /**
   * Turns the request into the list of months to close.
   *
   * @steps
   * 1. Expand a quarter into its three months and stop, so a request carrying
   *    both a quarter and a list has one defined meaning rather than two.
   * 2. Reject an empty request, which would otherwise close nothing and report
   *    success.
   * 3. Reject malformed months as a group, naming all of them, so a caller fixing
   *    a list is not made to resubmit once per bad entry.
   * 4. Deduplicate and sort, so the audit trail reads in calendar order.
   *
   * @param input - The months or the quarter supplied.
   * @returns The months, deduplicated and in order.
   * @throws BadRequestException When neither is supplied or a month is malformed.
   */
  private resolveMonths(input: CreatePeriodLockDTO): string[] {
    if (input.quarter !== undefined) {
      return quarterMonths(input.quarter);
    }

    if (input.months === undefined || input.months.length === 0) {
      throw new BadRequestException('Supply either months or a quarter to lock.');
    }

    const invalid = input.months.filter((month: string) => !isValidMonth(month));

    if (invalid.length > 0) {
      throw new BadRequestException(
        `Invalid month ${invalid.map((month: string) => `"${month}"`).join(', ')}. Expected YYYY-MM.`,
      );
    }

    return [...new Set<string>(input.months)].sort(compareMonths);
  }
}
