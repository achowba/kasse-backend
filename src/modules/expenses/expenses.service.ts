import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientSession, QueryFilter, Types } from 'mongoose';
import { DataVersionService } from '@common/cache';
import { IPaginatedResponse, toPaginatedResponse } from '@common/pagination';
import { AuditActionEnum, AuditEntityEnum, AuditLogService } from '@modules/audit-log';
import { CategoriesService } from '@modules/categories';
import { PeriodLocksService } from '@modules/period-locks';
import { CreateExpenseDTO } from './dto/create-expense.dto';
import { ExpenseResponseDTO } from './dto/expense-response.dto';
import { ListExpensesQueryDTO } from './dto/list-expenses.query.dto';
import { UpdateExpenseDTO } from './dto/update-expense.dto';
import { ExpenseSourceEnum } from './expenses.enums';
import { ExpensesRepository } from './expenses.repository';
import { Expense, ExpenseDocument } from './schemas/expense.schema';

/**
 * Expenses: the money actually spent, against which a plan is measured.
 *
 * @remarks
 * An expense is one line item. The report sums a category's expenses for a month
 * into the figure it calls the actual. There is no upsert here for that reason:
 * collapsing to one record per category and month would force a read, add, and
 * write back, which loses an entry whenever two people log at once.
 *
 * Every write checks the period lock first, so a closed month is the reason
 * reported rather than a category problem the user would fix pointlessly.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly expensesRepository: ExpensesRepository,
    private readonly periodLocksService: PeriodLocksService,
    private readonly categoriesService: CategoriesService,
    private readonly auditLogService: AuditLogService,
    private readonly dataVersionService: DataVersionService,
  ) {}

  /**
   * Logs an expense.
   *
   * @steps
   * 1. Reject the write when the month is closed, before any other work.
   * 2. Confirm the category is one the caller may use, which covers both a
   *    missing category and one belonging to another account.
   * 3. Write the expense, stamped as manually entered.
   * 4. Hand the creation to the audit trail, which writes it after this returns.
   *
   * @param userId - The authenticated caller.
   * @param input - The expense to log.
   * @param requestId - The request making the change.
   * @returns The stored expense.
   * @throws PeriodLockedException When the month is closed.
   * @throws NotFoundException When the category is not one the caller can use.
   */
  async create(userId: Types.ObjectId, input: CreateExpenseDTO, requestId?: string): Promise<ExpenseDocument> {
    await this.periodLocksService.assertUnlocked(userId, input.month);

    const categoryId = new Types.ObjectId(input.categoryId);

    await this.categoriesService.getVisibleById(userId, categoryId);

    const expense = await this.expensesRepository.create(userId, {
      categoryId,
      month: input.month,
      amountMinor: input.amountMinor,
      note: input.note ?? null,
      source: ExpenseSourceEnum.MANUAL,
      importBatchId: null,
    });

    this.dataVersionService.bump(userId);

    this.auditLogService.record({
      userId,
      action: AuditActionEnum.EXPENSE_CREATED,
      entity: AuditEntityEnum.EXPENSE,
      entityId: expense._id,
      after: { categoryId: input.categoryId, month: input.month, amountMinor: input.amountMinor },
      requestId,
    });

    return expense;
  }

  /**
   * Corrects an expense.
   *
   * @remarks
   * The month may change, and that is what makes this the one place the move
   * check matters. Changing the month alters the totals of two periods, so both
   * the month the expense is leaving and the one it is joining must be open.
   * Checking only the destination would let a user empty a closed period by
   * moving its expenses out of it.
   *
   * @steps
   * 1. Read the expense, so the check runs against its stored month rather than
   *    one the caller supplied.
   * 2. Reject the change when either the month it is leaving or the month it is
   *    joining is closed.
   * 3. Confirm any new category is one the caller may use.
   * 4. Assemble only the fields actually supplied, so an omitted field is left
   *    alone rather than overwritten with undefined.
   * 5. Write the change and hand both sides of it to the audit trail.
   *
   * @param userId - The authenticated caller.
   * @param expenseId - The expense to correct.
   * @param changes - The fields to change.
   * @param requestId - The request making the change.
   * @returns The updated expense.
   * @throws NotFoundException When the caller has no such expense, or the new category is not usable.
   * @throws PeriodLockedException When either month is closed.
   */
  async update(
    userId: Types.ObjectId,
    expenseId: Types.ObjectId,
    changes: UpdateExpenseDTO,
    requestId?: string,
  ): Promise<ExpenseDocument> {
    const existing = await this.expensesRepository.findById(userId, expenseId);

    if (existing === null) {
      throw new NotFoundException('Expense not found.');
    }

    await this.periodLocksService.assertMoveAllowed(userId, existing.month, changes.month ?? existing.month);

    const update: Partial<Expense> = {};

    if (changes.categoryId !== undefined) {
      const categoryId = new Types.ObjectId(changes.categoryId);

      await this.categoriesService.getVisibleById(userId, categoryId);
      update.categoryId = categoryId;
    }

    if (changes.month !== undefined) {
      update.month = changes.month;
    }

    if (changes.amountMinor !== undefined) {
      update.amountMinor = changes.amountMinor;
    }

    if (changes.note !== undefined) {
      update.note = changes.note;
    }

    const updated = await this.expensesRepository.updateOne(userId, { _id: expenseId }, { $set: update });

    if (updated === null) {
      throw new NotFoundException('Expense not found.');
    }

    this.dataVersionService.bump(userId);

    this.auditLogService.record({
      userId,
      action: AuditActionEnum.EXPENSE_UPDATED,
      entity: AuditEntityEnum.EXPENSE,
      entityId: expenseId,
      before: {
        categoryId: existing.categoryId.toString(),
        month: existing.month,
        amountMinor: existing.amountMinor,
      },
      after: {
        categoryId: updated.categoryId.toString(),
        month: updated.month,
        amountMinor: updated.amountMinor,
      },
      requestId,
    });

    return updated;
  }

  /**
   * Removes an expense.
   *
   * @steps
   * 1. Read the expense, both to confirm it is the caller's and to learn its
   *    month.
   * 2. Reject the removal when that month is closed.
   * 3. Soft delete it.
   * 4. Hand what it was to the audit trail, since the record is no longer
   *    readable through the normal path.
   *
   * @param userId - The authenticated caller.
   * @param expenseId - The expense to remove.
   * @param requestId - The request making the change.
   * @throws NotFoundException When the caller has no such expense.
   * @throws PeriodLockedException When the expense's month is closed.
   */
  async remove(userId: Types.ObjectId, expenseId: Types.ObjectId, requestId?: string): Promise<void> {
    const existing = await this.expensesRepository.findById(userId, expenseId);

    if (existing === null) {
      throw new NotFoundException('Expense not found.');
    }

    await this.periodLocksService.assertUnlocked(userId, existing.month);
    await this.expensesRepository.softDelete(userId, expenseId);

    this.dataVersionService.bump(userId);

    this.auditLogService.record({
      userId,
      action: AuditActionEnum.EXPENSE_DELETED,
      entity: AuditEntityEnum.EXPENSE,
      entityId: expenseId,
      before: {
        categoryId: existing.categoryId.toString(),
        month: existing.month,
        amountMinor: existing.amountMinor,
      },
      requestId,
    });
  }

  /**
   * Writes expenses from an import, inside the import's transaction.
   *
   * @remarks
   * Bypasses the per expense lock check on purpose: the import checks every month
   * in the file in one query before writing anything, so repeating the check per
   * row would be a round trip each. It cannot bypass the rule, because the import
   * refuses to start when any month in the file is closed.
   *
   * The audit entry is the import's own, written once for the batch rather than
   * once per row, so a thousand row file does not produce a thousand entries that
   * say the same thing.
   *
   * @param userId - The authenticated caller.
   * @param rows - The expenses to write.
   * @param importBatchId - The import writing them.
   * @param session - The import's transaction session.
   * @returns The stored expenses.
   */
  async createManyFromImport(
    userId: Types.ObjectId,
    rows: { categoryId: Types.ObjectId; month: string; amountMinor: number; note: string | null }[],
    importBatchId: Types.ObjectId,
    session: ClientSession,
  ): Promise<ExpenseDocument[]> {
    const created: ExpenseDocument[] = [];

    for (const row of rows) {
      created.push(
        await this.expensesRepository.create(userId, { ...row, source: ExpenseSourceEnum.CSV, importBatchId }, session),
      );
    }

    // Once for the batch rather than once per row. The version only has to change,
    // not change a particular number of times, and a thousand row file should not
    // invalidate the cache a thousand times.
    this.dataVersionService.bump(userId);

    return created;
  }

  /**
   * Lists expenses, newest month first.
   *
   * @steps
   * 1. Turn an optional month range into a single indexed comparison, so an
   *    open ended range is still one query rather than a special case.
   * 2. Add the category and import filters only when supplied, so an absent
   *    filter does not become a match against undefined.
   * 3. Read the page and the total for the whole filtered set together.
   *
   * @param userId - The authenticated caller.
   * @param query - Filters and pagination.
   * @returns The expenses.
   */
  async list(userId: Types.ObjectId, query: ListExpensesQueryDTO): Promise<IPaginatedResponse<ExpenseResponseDTO>> {
    const filter: QueryFilter<Expense> = {};
    const month: Record<string, string> = {};

    if (query.from !== undefined) {
      month['$gte'] = query.from;
    }

    if (query.to !== undefined) {
      month['$lte'] = query.to;
    }

    if (Object.keys(month).length > 0) {
      filter.month = month;
    }

    if (query.categoryId !== undefined) {
      filter.categoryId = new Types.ObjectId(query.categoryId);
    }

    if (query.importBatchId !== undefined) {
      filter.importBatchId = new Types.ObjectId(query.importBatchId);
    }

    const { expenses, total } = await this.expensesRepository.list(userId, filter, query.limit, query.offset);

    return toPaginatedResponse(
      expenses.map((expense: ExpenseDocument) => ExpenseResponseDTO.fromDocument(expense)),
      total,
      query,
    );
  }
}
