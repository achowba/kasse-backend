import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { BaseTenantRepository } from '@common/database';
import { PeriodLock, PeriodLockDocument } from './schemas/period-lock.schema';

/**
 * Data access for period locks.
 */
@Injectable()
export class PeriodLocksRepository extends BaseTenantRepository<PeriodLock> {
  constructor(@InjectModel(PeriodLock.name) model: Model<PeriodLock>) {
    super(model);
  }

  /**
   * Reports whether a month is closed.
   *
   * @remarks
   * The hottest read in the system: every write to a plan or an expense calls it,
   * and a CSV import calls it once per distinct month. It is a covered existence
   * check on the unique index, so it stays cheap.
   *
   * @param userId - The account whose period is in question.
   * @param month - The month to check.
   * @param session - Optional transaction session, so the check and the write it guards read the same snapshot.
   * @returns True when the month is locked.
   */
  async isLocked(userId: Types.ObjectId, month: string, session?: ClientSession): Promise<boolean> {
    const found = await this.model.exists({ userId, month, deletedAt: null }).session(session ?? null);

    return found !== null;
  }

  /**
   * Finds which of several months are closed.
   *
   * @remarks
   * One query rather than one per month. A CSV import spanning a year would
   * otherwise issue twelve round trips before writing anything.
   *
   * @param userId - The account whose periods are in question.
   * @param months - The months to check.
   * @param session - Optional transaction session.
   * @returns The subset that is locked.
   */
  async findLockedAmong(userId: Types.ObjectId, months: string[], session?: ClientSession): Promise<string[]> {
    const locks = await this.model
      .find({ userId, month: { $in: months }, deletedAt: null }, { month: 1 })
      .session(session ?? null)
      .exec();

    return locks.map((lock) => lock.month);
  }

  /**
   * Closes a month, or leaves it closed.
   *
   * @remarks
   * An upsert, so locking an already locked month is harmless and keeps the
   * original time rather than resetting it. That matters because a client
   * locking a quarter may overlap a month that was locked on its own.
   *
   * @param userId - The account whose period is being closed.
   * @param month - The month to close.
   * @param session - Optional transaction session.
   * @returns True when this call is what closed it, false when it already was.
   */
  async lock(userId: Types.ObjectId, month: string, session?: ClientSession): Promise<boolean> {
    const result = await this.model
      .updateOne(
        { userId, month, deletedAt: null },
        { $setOnInsert: { userId, month, lockedAt: new Date(), deletedAt: null } },
        { upsert: true, session },
      )
      .exec();

    return result.upsertedCount > 0;
  }

  /**
   * Reopens a month.
   *
   * @remarks
   * Removes the row rather than soft deleting it. A lock is a fact about a period
   * rather than data a user owns, and the audit trail already records that the
   * period was unlocked, by whom, and when. Keeping tombstones would also break
   * the unique index that makes locking idempotent.
   *
   * @param userId - The account whose period is being reopened.
   * @param month - The month to reopen.
   * @returns True when a lock was removed.
   */
  async unlock(userId: Types.ObjectId, month: string): Promise<boolean> {
    const result = await this.model.deleteOne({ userId, month }).exec();

    return result.deletedCount > 0;
  }

  /**
   * Lists closed months in a range.
   *
   * @param userId - The account whose periods to list.
   * @param from - First month of the range, inclusive.
   * @param to - Last month of the range, inclusive.
   * @returns The locks, oldest first.
   */
  async listInRange(userId: Types.ObjectId, from?: string, to?: string): Promise<PeriodLockDocument[]> {
    const month: Record<string, string> = {};

    if (from !== undefined) {
      month['$gte'] = from;
    }

    if (to !== undefined) {
      month['$lte'] = to;
    }

    const filter = Object.keys(month).length > 0 ? { month } : {};

    return await this.find(userId, filter, { sort: { month: 1 } });
  }
}
