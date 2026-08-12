import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Types } from 'mongoose';
import { CurrentUser, type IAuthenticatedUser } from '@common/auth';
import { ApiVersionEnum } from '@common/enums';
import { ErrorResponseDTO } from '@common/errors';
import { IPaginatedResponse } from '@common/pagination';
import { ParseObjectIdPipe } from '@common/pipes';
import { RequestId } from '@common/request-context';
import { ListPlansQueryDTO } from './dto/list-plans.query.dto';
import { PlanResponseDTO } from './dto/plan-response.dto';
import { UpdatePlanDTO } from './dto/update-plan.dto';
import { UpsertPlanDTO } from './dto/upsert-plan.dto';
import { LOCKED_RESPONSE } from './plans.constants';
import { PlansService } from './plans.service';

/**
 * Monthly spending targets.
 */
@ApiTags('Plans')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'The access token is missing, expired, or invalid.', type: ErrorResponseDTO })
@Controller({ path: 'plans', version: ApiVersionEnum.V1 })
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  /**
   * Lists targets.
   *
   * @param user - The authenticated caller.
   * @param query - Filters and pagination.
   * @returns The targets, newest month first.
   */
  @Get()
  @ApiOperation({
    summary: 'List targets',
    description: `Returns monthly targets, newest month first, optionally filtered by month range and category.

Each row carries the category id rather than its name. Resolving names here would mean a lookup per row, and a client listing targets already holds the category list it built its picker from. The report endpoint does include names, because there the join happens once inside the aggregation.`,
  })
  @ApiOkResponse({ description: 'A page of targets.', type: [PlanResponseDTO] })
  async list(
    @CurrentUser() user: IAuthenticatedUser,
    @Query() query: ListPlansQueryDTO,
  ): Promise<IPaginatedResponse<PlanResponseDTO>> {
    return await this.plansService.list(user.userId, query);
  }

  /**
   * Sets the target for one category and month.
   *
   * @param user - The authenticated caller.
   * @param input - The cell and the target.
   * @param requestId - The request making the change.
   * @returns The stored target.
   */
  @Put()
  @ApiOperation({
    summary: 'Set a target',
    description: `Sets the target for one category and one month, creating it or replacing it.

Addressed by category and month rather than by id, because that is how a target is thought about: a cell in a grid. Sending the same request twice updates the cell rather than creating a second target, so a client never has to know whether one already existed. A unique index enforces that, so two requests racing on the same cell also produce one record.

A target of \`0\` is meaningful and is not the same as having no target. Zero means nothing was planned, so spend against it is reported as unplanned with a \`null\` variance percentage rather than an infinite one. No target at all means the cell is absent from the plan side of the report entirely.

Rejected with \`423\` when the month is closed, and with \`404\` when the category is not one the caller can use.`,
  })
  @ApiOkResponse({ description: 'The stored target.', type: PlanResponseDTO })
  @ApiNotFoundResponse({ description: 'The category is not one the caller can use.', type: ErrorResponseDTO })
  @ApiResponse(LOCKED_RESPONSE)
  async upsert(
    @CurrentUser() user: IAuthenticatedUser,
    @Body() input: UpsertPlanDTO,
    @RequestId() requestId?: string,
  ): Promise<PlanResponseDTO> {
    const plan = await this.plansService.upsert(user.userId, input, requestId);

    return PlanResponseDTO.fromDocument(plan);
  }

  /**
   * Changes the amount of an existing target.
   *
   * @param user - The authenticated caller.
   * @param planId - The target to change.
   * @param changes - The new amount.
   * @param requestId - The request making the change.
   * @returns The updated target.
   */
  @Patch(':planId')
  @ApiParam({ name: 'planId', description: 'Identifier from the plan list.', example: '65f1c2d3e4b5a6c7d8e9f0b1' })
  @ApiOperation({
    summary: 'Change a target amount',
    description: `Changes the amount of an existing target.

Only the amount. Moving a target to a different category or month is not an edit but a different cell: it would vacate one cell and overwrite another, and either end could be in a closed period. Set the new cell and delete the old one, so each goes through its own lock check.

Rejected with \`423\` when the target's month is closed.`,
  })
  @ApiOkResponse({ description: 'The updated target.', type: PlanResponseDTO })
  @ApiNotFoundResponse({ description: 'The caller has no target with that id.', type: ErrorResponseDTO })
  @ApiResponse(LOCKED_RESPONSE)
  async update(
    @CurrentUser() user: IAuthenticatedUser,
    @Param('planId', ParseObjectIdPipe) planId: Types.ObjectId,
    @Body() changes: UpdatePlanDTO,
    @RequestId() requestId?: string,
  ): Promise<PlanResponseDTO> {
    const plan = await this.plansService.update(user.userId, planId, changes, requestId);

    return PlanResponseDTO.fromDocument(plan);
  }

  /**
   * Removes a target.
   *
   * @param user - The authenticated caller.
   * @param planId - The target to remove.
   * @param requestId - The request making the change.
   */
  @Delete(':planId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'planId', description: 'Identifier from the plan list.', example: '65f1c2d3e4b5a6c7d8e9f0b1' })
  @ApiOperation({
    summary: 'Remove a target',
    description: `Removes a target, so the category and month no longer appear on the plan side of a report.

The delete is soft. The audit trail keeps what the target was, so a report run before the deletion can still be explained, and the cell can be planned again afterwards.

Rejected with \`423\` when the target's month is closed.`,
  })
  @ApiNoContentResponse({ description: 'The target was removed.' })
  @ApiNotFoundResponse({ description: 'The caller has no target with that id.', type: ErrorResponseDTO })
  @ApiResponse(LOCKED_RESPONSE)
  async remove(
    @CurrentUser() user: IAuthenticatedUser,
    @Param('planId', ParseObjectIdPipe) planId: Types.ObjectId,
    @RequestId() requestId?: string,
  ): Promise<void> {
    await this.plansService.remove(user.userId, planId, requestId);
  }
}
