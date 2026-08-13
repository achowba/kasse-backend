import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import { BaseTenantRepository } from '@common/database';
import { Expense, ExpenseDocument } from './schemas/expense.schema';

/**
 * Data access for expenses.
 */
@Injectable()
export class ExpensesRepository extends BaseTenantRepository<Expense> {
  constructor(@InjectModel(Expense.name) model: Model<Expense>) {
    super(model);
  }

  /**
   * Lists expenses, newest month first.
   *
   * @remarks
   * The same call serves the list endpoint and report drill down. Clicking a
   * report cell is a filter on category and month, which is a query this already
   * expresses, so there is no separate drill down endpoint to keep in step.
   *
   * @param userId - The authenticated caller.
   * @param filter - Conditions to match.
   * @param limit - How many to return.
   * @param offset - How many to skip.
   * @returns The expenses and the total matching.
   */
  async list(
    userId: Types.ObjectId,
    filter: QueryFilter<Expense>,
    limit: number,
    offset: number,
  ): Promise<{ expenses: ExpenseDocument[]; total: number }> {
    const [expenses, total] = await Promise.all([
      this.find(userId, filter, { sort: { month: -1, createdAt: -1 }, skip: offset, limit }),
      this.count(userId, filter),
    ]);

    return { expenses, total };
  }
}
