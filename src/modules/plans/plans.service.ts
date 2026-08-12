import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryFilter, Types } from 'mongoose';
import { IPaginatedResponse, toPaginatedResponse } from '@common/pagination';
import { AuditActionEnum, AuditEntityEnum, AuditLogService } from '@modules/audit-log';
import { CategoriesService } from '@modules/categories';
import { PeriodLocksService } from '@modules/period-locks';
import { ListPlansQueryDTO } from './dto/list-plans.query.dto';
import { PlanResponseDTO } from './dto/plan-response.dto';
import { UpdatePlanDTO } from './dto/update-plan.dto';
import { UpsertPlanDTO } from './dto/upsert-plan.dto';
import { PlansRepository } from './plans.repository';
import { Plan, PlanDocument } from './schemas/plan.schema';

/**
 * Monthly spending targets.
 *
 * @remarks
 * Every write here does three things before touching the database: confirms the
 * period is open, confirms the caller may use the category, and records the
 * change. The order matters. Checking the lock first means a write to a closed
 * period is rejected for the reason the user needs to hear, rather than for a
 * category problem they would then fix pointlessly.
 */
@Injectable()
export class PlansService {
  constructor(
    private readonly plansRepository: PlansRepository,
    private readonly periodLocksService: PeriodLocksService,
    private readonly categoriesService: CategoriesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Sets the target for one category and month.
   *
   * @remarks
   * Addressed by category and month rather than by id, because that is how a
   * user thinks of it: a cell in a grid. Setting the same cell twice updates it,
   * so a client can send the same request repeatedly without creating duplicates
   * or having to know whether a target already existed.
   *
   * @steps
   * 1. Reject the write when the month is closed.
   * 2. Confirm the caller may use the category.
   * 3. Read the current target for the cell, which is what decides whether this
   *    is recorded as a creation or a change, and supplies the previous amount.
   * 4. Write the cell.
   * 5. Audit it, carrying the previous amount only when there was one.
   *
   * @param userId - The authenticated caller.
   * @param input - The cell and the target.
   * @param requestId - The request making the change.
   * @returns The stored target.
   * @throws PeriodLockedException When the month is closed.
   * @throws NotFoundException When the category is not one the caller can use.
   */
  async upsert(userId: Types.ObjectId, input: UpsertPlanDTO, requestId?: string): Promise<PlanDocument> {
    await this.periodLocksService.assertUnlocked(userId, input.month);

    const categoryId = new Types.ObjectId(input.categoryId);

    await this.categoriesService.getVisibleById(userId, categoryId);

    const existing = await this.plansRepository.findForCell(userId, categoryId, input.month);
    const plan = await this.plansRepository.upsert(userId, categoryId, input.month, input.targetMinor);

    this.auditLogService.record({
      userId,
      action: existing === null ? AuditActionEnum.PLAN_CREATED : AuditActionEnum.PLAN_UPDATED,
      entity: AuditEntityEnum.PLAN,
      entityId: plan._id,
      ...(existing === null ? {} : { before: { targetMinor: existing.targetMinor } }),
      after: { categoryId: input.categoryId, month: input.month, targetMinor: input.targetMinor },
      requestId,
    });

    return plan;
  }

  /**
   * Changes the amount of an existing target.
   *
   * @steps
   * 1. Read the target, so the lock check runs against its stored month rather
   *    than one the caller could supply.
   * 2. Reject the change when that month is closed.
   * 3. Write the new amount.
   * 4. Audit both amounts.
   *
   * @param userId - The authenticated caller.
   * @param planId - The target to change.
   * @param changes - The new amount.
   * @param requestId - The request making the change.
   * @returns The updated target.
   * @throws NotFoundException When the caller has no such target.
   * @throws PeriodLockedException When the target's month is closed.
   */
  async update(
    userId: Types.ObjectId,
    planId: Types.ObjectId,
    changes: UpdatePlanDTO,
    requestId?: string,
  ): Promise<PlanDocument> {
    const existing = await this.plansRepository.findById(userId, planId);

    if (existing === null) {
      throw new NotFoundException('Plan not found.');
    }

    await this.periodLocksService.assertUnlocked(userId, existing.month);

    const updated = await this.plansRepository.updateOne(userId, { _id: planId }, { $set: changes });

    if (updated === null) {
      throw new NotFoundException('Plan not found.');
    }

    this.auditLogService.record({
      userId,
      action: AuditActionEnum.PLAN_UPDATED,
      entity: AuditEntityEnum.PLAN,
      entityId: planId,
      before: { targetMinor: existing.targetMinor },
      after: { targetMinor: updated.targetMinor },
      requestId,
    });

    return updated;
  }

  /**
   * Removes a target.
   *
   * @remarks
   * Soft deleted, so the audit trail keeps what the target was and a report run
   * before the deletion can still be explained. The partial unique index means
   * the same cell can be planned again afterwards.
   *
   * @steps
   * 1. Read the target, both to confirm it is the caller's and to learn its
   *    month.
   * 2. Reject the removal when that month is closed.
   * 3. Soft delete it.
   * 4. Audit what it was, since the row itself is no longer readable through the
   *    normal path.
   *
   * @param userId - The authenticated caller.
   * @param planId - The target to remove.
   * @param requestId - The request making the change.
   * @throws NotFoundException When the caller has no such target.
   * @throws PeriodLockedException When the target's month is closed.
   */
  async remove(userId: Types.ObjectId, planId: Types.ObjectId, requestId?: string): Promise<void> {
    const existing = await this.plansRepository.findById(userId, planId);

    if (existing === null) {
      throw new NotFoundException('Plan not found.');
    }

    await this.periodLocksService.assertUnlocked(userId, existing.month);
    await this.plansRepository.softDelete(userId, planId);

    this.auditLogService.record({
      userId,
      action: AuditActionEnum.PLAN_DELETED,
      entity: AuditEntityEnum.PLAN,
      entityId: planId,
      before: {
        categoryId: existing.categoryId.toString(),
        month: existing.month,
        targetMinor: existing.targetMinor,
      },
      requestId,
    });
  }

  /**
   * Lists targets, newest month first.
   *
   * @steps
   * 1. Turn an optional month range into a single indexed comparison, so an open
   *    ended range is still one query rather than a special case.
   * 2. Add the category filter only when supplied, so an absent filter does not
   *    become a match against undefined.
   * 3. Read the page and the total for the whole filtered set together.
   *
   * @param userId - The authenticated caller.
   * @param query - Filters and pagination.
   * @returns The targets.
   */
  async list(userId: Types.ObjectId, query: ListPlansQueryDTO): Promise<IPaginatedResponse<PlanResponseDTO>> {
    const filter: QueryFilter<Plan> = {};
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

    const { plans, total } = await this.plansRepository.list(userId, filter, query.limit, query.offset);

    return toPaginatedResponse(
      plans.map((plan) => PlanResponseDTO.fromDocument(plan)),
      total,
      query,
    );
  }
}
