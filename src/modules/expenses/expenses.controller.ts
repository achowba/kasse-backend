import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
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
import { CreateExpenseDTO } from './dto/create-expense.dto';
import { ExpenseResponseDTO } from './dto/expense-response.dto';
import { ListExpensesQueryDTO } from './dto/list-expenses.query.dto';
import { UpdateExpenseDTO } from './dto/update-expense.dto';
import { LOCKED_RESPONSE } from './expenses.constants';
import { ExpensesService } from './expenses.service';

/**
 * Money actually spent.
 */
@ApiTags('Expenses')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'The access token is missing, expired, or invalid.', type: ErrorResponseDTO })
@Controller({ path: 'expenses', version: ApiVersionEnum.V1 })
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  /**
   * Lists expenses.
   *
   * @param user - The authenticated caller.
   * @param query - Filters and pagination.
   * @returns The expenses, newest month first.
   */
  @Get()
  @ApiOperation({
    summary: 'List expenses',
    description: `Returns expenses, newest month first, optionally filtered by month range, category, or the import that wrote them.

This is also the report's drill down. A report cell is one category in one month, which is \`categoryId\` with \`from\` and \`to\` set to the same month, so there is no separate drill down endpoint that could disagree with this one.

Filtering by \`importBatchId\` answers the question a reviewer actually asks after an import, which is what that file put in.`,
  })
  @ApiOkResponse({ description: 'A page of expenses.', type: [ExpenseResponseDTO] })
  async list(
    @CurrentUser() user: IAuthenticatedUser,
    @Query() query: ListExpensesQueryDTO,
  ): Promise<IPaginatedResponse<ExpenseResponseDTO>> {
    return await this.expensesService.list(user.userId, query);
  }

  /**
   * Logs an expense.
   *
   * @param user - The authenticated caller.
   * @param input - The expense to log.
   * @param requestId - The request making the change.
   * @returns The stored expense.
   */
  @Post()
  @ApiOperation({
    summary: 'Log an expense',
    description: `Logs one expense against a category and a month.

Each call creates a record. Logging twice against the same category and month is two expenses, not an overwrite, because that is what spending is: a month's total is the sum of its line items. The report adds them up. This is the opposite of a plan, where one category and month hold a single target.

An expense belongs to a month rather than a date. Nothing here is a timestamp, so no timezone can move spend into the wrong period.

A negative amount is allowed and means money came back, such as a refund or a credit note.

Rejected with \`423\` when the month is closed, and with \`404\` when the category is not one the caller can use.`,
  })
  @ApiCreatedResponse({ description: 'The stored expense.', type: ExpenseResponseDTO })
  @ApiNotFoundResponse({ description: 'The category is not one the caller can use.', type: ErrorResponseDTO })
  @ApiResponse(LOCKED_RESPONSE)
  async create(
    @CurrentUser() user: IAuthenticatedUser,
    @Body() input: CreateExpenseDTO,
    @RequestId() requestId?: string,
  ): Promise<ExpenseResponseDTO> {
    const expense = await this.expensesService.create(user.userId, input, requestId);

    return ExpenseResponseDTO.fromDocument(expense);
  }

  /**
   * Corrects an expense.
   *
   * @param user - The authenticated caller.
   * @param expenseId - The expense to correct.
   * @param changes - The fields to change.
   * @param requestId - The request making the change.
   * @returns The updated expense.
   */
  @Patch(':expenseId')
  @ApiParam({ name: 'expenseId', description: 'Identifier from the expense list.', example: '65f1c2d3e4b5a6c7d8e9f0c1' })
  @ApiOperation({
    summary: 'Correct an expense',
    description: `Changes an expense's category, month, amount, or note. Omitted fields are left alone.

The month is changeable here, unlike on a plan. Spend genuinely lands in the wrong month, usually because an invoice was dated differently from when the cost was incurred, and correcting that is an edit rather than a different record.

That is why a month change is checked at both ends. Moving an expense out of a closed month changes that month's total, so it is an edit to a closed period just as much as moving one in. A request that touches a closed month at either end is rejected with \`423\` naming the month that blocked it.`,
  })
  @ApiOkResponse({ description: 'The updated expense.', type: ExpenseResponseDTO })
  @ApiNotFoundResponse({
    description: 'The caller has no expense with that id, or the new category is not one they can use.',
    type: ErrorResponseDTO,
  })
  @ApiResponse(LOCKED_RESPONSE)
  async update(
    @CurrentUser() user: IAuthenticatedUser,
    @Param('expenseId', ParseObjectIdPipe) expenseId: Types.ObjectId,
    @Body() changes: UpdateExpenseDTO,
    @RequestId() requestId?: string,
  ): Promise<ExpenseResponseDTO> {
    const expense = await this.expensesService.update(user.userId, expenseId, changes, requestId);

    return ExpenseResponseDTO.fromDocument(expense);
  }

  /**
   * Removes an expense.
   *
   * @param user - The authenticated caller.
   * @param expenseId - The expense to remove.
   * @param requestId - The request making the change.
   */
  @Delete(':expenseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'expenseId', description: 'Identifier from the expense list.', example: '65f1c2d3e4b5a6c7d8e9f0c1' })
  @ApiOperation({
    summary: 'Remove an expense',
    description: `Removes an expense, so it no longer counts toward the spend figure for its category and month.

The delete is soft. The audit trail keeps what the expense was, so a report run before the deletion can still be explained.

Rejected with \`423\` when the expense's month is closed.`,
  })
  @ApiNoContentResponse({ description: 'The expense was removed.' })
  @ApiNotFoundResponse({ description: 'The caller has no expense with that id.', type: ErrorResponseDTO })
  @ApiResponse(LOCKED_RESPONSE)
  async remove(
    @CurrentUser() user: IAuthenticatedUser,
    @Param('expenseId', ParseObjectIdPipe) expenseId: Types.ObjectId,
    @RequestId() requestId?: string,
  ): Promise<void> {
    await this.expensesService.remove(user.userId, expenseId, requestId);
  }
}
