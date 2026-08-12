import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type IAuthenticatedUser } from '@common/auth';
import { ApiVersionEnum } from '@common/enums';
import { ErrorResponseDTO } from '@common/errors';
import { RequestId } from '@common/request-context';
import { CreatePeriodLockDTO } from './dto/create-period-lock.dto';
import { ListPeriodLocksQueryDTO } from './dto/list-period-locks.query.dto';
import { PeriodLockResponseDTO } from './dto/period-lock-response.dto';
import { PeriodLocksService } from './period-locks.service';

/**
 * Closed accounting periods.
 *
 * @remarks
 * Locking is enforced in the service layer, not here. Every write to a plan or
 * an actual, including every row of a CSV import, passes through the same gate,
 * so hiding a button in a client is not what makes a period read only.
 */
@ApiTags('Period locks')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'The access token is missing, expired, or invalid.', type: ErrorResponseDTO })
@Controller({ path: 'period-locks', version: ApiVersionEnum.V1 })
export class PeriodLocksController {
  constructor(private readonly periodLocksService: PeriodLocksService) {}

  /**
   * Lists closed periods.
   *
   * @param user - The authenticated caller.
   * @param query - Optional month range.
   * @returns The closed months, oldest first.
   */
  @Get()
  @ApiOperation({
    summary: 'List closed periods',
    description: `Returns the months that are closed, oldest first, optionally within a range.

Not paginated. An account has at most a handful of locked months per year, and a client needs all of them at once to mark the right rows read only in a report.

The absence of a month from this list is what "open" means. There is no unlocked record.`,
  })
  @ApiOkResponse({ description: 'The closed periods.', type: [PeriodLockResponseDTO] })
  async list(@CurrentUser() user: IAuthenticatedUser, @Query() query: ListPeriodLocksQueryDTO): Promise<PeriodLockResponseDTO[]> {
    const locks = await this.periodLocksService.list(user.userId, query.from, query.to);

    return locks.map((lock) => PeriodLockResponseDTO.fromDocument(lock));
  }

  /**
   * Closes one or more periods.
   *
   * @param user - The authenticated caller.
   * @param input - The months or the quarter to close.
   * @param requestId - The request making the change.
   * @returns The months this call closed.
   */
  @Post()
  @ApiOperation({
    summary: 'Close periods',
    description: `Closes months so their plans and actuals become read only.

Supply either \`months\` or \`quarter\`. A quarter expands to its three calendar months, so the stored shape is always one record per month and a single month of a closed quarter can be reopened without a special case.

Closing an already closed month is harmless: it is skipped and its original time is preserved, so locking a quarter that overlaps a month closed earlier does not rewrite when that happened. The response lists only the months this call actually closed.

Afterwards, any attempt to create, change, or delete a plan or an actual in those months is rejected with \`423\` and the code \`PERIOD_LOCKED\`, including rows inside a CSV import. Moving a record out of a closed month is rejected too, because that changes the closed month's totals.`,
  })
  @ApiCreatedResponse({ description: 'The months this call closed. Already closed months are omitted.', type: [String] })
  @ApiBadRequestResponse({
    description: 'Neither months nor a quarter was supplied, or a month was malformed.',
    type: ErrorResponseDTO,
  })
  async lock(
    @CurrentUser() user: IAuthenticatedUser,
    @Body() input: CreatePeriodLockDTO,
    @RequestId() requestId?: string,
  ): Promise<{ locked: string[] }> {
    return { locked: await this.periodLocksService.lock(user.userId, input, requestId) };
  }

  /**
   * Reopens a period.
   *
   * @param user - The authenticated caller.
   * @param month - The month to reopen.
   * @param requestId - The request making the change.
   */
  @Delete(':month')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'month', description: 'The month to reopen, as YYYY-MM.', example: '2026-01' })
  @ApiOperation({
    summary: 'Reopen a period',
    description: `Reopens a single month, making its plans and actuals editable again.

Reopening is recorded in the audit log, with the month and the request that did it, so a period that was closed and then reopened leaves a trail rather than looking as though it was never closed.

A month that is not closed answers 404.`,
  })
  @ApiNoContentResponse({ description: 'The period is open.' })
  @ApiNotFoundResponse({ description: 'That month is not closed.', type: ErrorResponseDTO })
  @ApiBadRequestResponse({ description: 'The month is malformed.', type: ErrorResponseDTO })
  async unlock(
    @CurrentUser() user: IAuthenticatedUser,
    @Param('month') month: string,
    @RequestId() requestId?: string,
  ): Promise<void> {
    await this.periodLocksService.unlock(user.userId, month, requestId);
  }
}
