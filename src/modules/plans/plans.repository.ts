import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, QueryFilter, Types } from 'mongoose';
import { BaseTenantRepository } from '@common/database';
import { Plan, PlanDocument } from './schemas/plan.schema';

/**
 * Data access for monthly targets.
 */
@Injectable()
export class PlansRepository extends BaseTenantRepository<Plan> {
  constructor(@InjectModel(Plan.name) model: Model<Plan>) {
    super(model);
  }

  /**
   * Finds the target for one category and month.
   *
   * @param userId - The authenticated caller.
   * @param categoryId - The category.
   * @param month - The month.
   * @param session - Optional transaction session.
   * @returns The target, or null when none is set.
   */
  async findForCell(
    userId: Types.ObjectId,
    categoryId: Types.ObjectId,
    month: string,
    session?: ClientSession,
  ): Promise<PlanDocument | null> {
    return await this.findOne(userId, { categoryId, month }, session);
  }

  /**
   * Sets the target for one category and month, creating it or replacing it.
   *
   * @remarks
   * An upsert against the unique index, so two requests racing on the same cell
   * produce one record rather than a duplicate key error the caller has to
   * interpret.
   *
   * @param userId - The authenticated caller.
   * @param categoryId - The category.
   * @param month - The month.
   * @param targetMinor - The target in minor units.
   * @param session - Optional transaction session.
   * @returns The stored target.
   */
  async upsert(
    userId: Types.ObjectId,
    categoryId: Types.ObjectId,
    month: string,
    targetMinor: number,
    session?: ClientSession,
  ): Promise<PlanDocument> {
    const plan = await this.model
      .findOneAndUpdate(
        { userId, categoryId, month, deletedAt: null },
        { $set: { targetMinor }, $setOnInsert: { userId, categoryId, month, deletedAt: null } },
        { new: true, upsert: true, runValidators: true, session },
      )
      .exec();

    return plan;
  }

  /**
   * Lists targets, newest month first.
   *
   * @param userId - The authenticated caller.
   * @param filter - Conditions to match.
   * @param limit - How many to return.
   * @param offset - How many to skip.
   * @returns The targets and the total matching.
   */
  async list(
    userId: Types.ObjectId,
    filter: QueryFilter<Plan>,
    limit: number,
    offset: number,
  ): Promise<{ plans: PlanDocument[]; total: number }> {
    const [plans, total] = await Promise.all([
      this.find(userId, filter, { sort: { month: -1, _id: 1 }, skip: offset, limit }),
      this.count(userId, filter),
    ]);

    return { plans, total };
  }
}
