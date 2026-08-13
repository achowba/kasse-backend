import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * A counter per account, bumped whenever that account's financial data changes.
 *
 * @remarks
 * This is the invalidation half of the report cache, and it lives in `common`
 * rather than in the reports module on purpose. The writers that have to bump it
 * are plans, expenses, and period locks; the reader that consumes it is reports,
 * which already imports all three for their models. Putting the counter in the
 * reports module would make those writers import it back, and a cycle between
 * feature modules is a runtime failure that compiles cleanly.
 *
 * Every account starts at version 0 without an entry, so an account that has never
 * written costs nothing.
 *
 * **Per process, deliberately.** Two instances hold independent counters, which is
 * correct: each also holds its own cache, so an instance only ever needs to
 * invalidate what it cached itself. Nothing is shared, so nothing can go stale
 * across instances.
 */
@Injectable()
export class DataVersionService {
  private readonly versions = new Map<string, number>();

  /**
   * Reads the current version for an account.
   *
   * @param userId - The account.
   * @returns The version, starting at 0.
   */
  current(userId: Types.ObjectId): number {
    return this.versions.get(userId.toString()) ?? 0;
  }

  /**
   * Marks an account's financial data as changed.
   *
   * @remarks
   * Called after a write to a plan, an expense, or a period lock. Anything cached
   * under the previous version becomes unreachable rather than being searched for
   * and deleted, so invalidation costs one increment no matter how many cached
   * reports the account had.
   *
   * @param userId - The account whose data changed.
   */
  bump(userId: Types.ObjectId): void {
    const key = userId.toString();

    this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
  }
}
