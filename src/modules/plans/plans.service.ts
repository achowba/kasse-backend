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

    await this.auditLogService.record({
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

    await this.auditLogService.record({
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

    await this.auditLogService.record({
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
