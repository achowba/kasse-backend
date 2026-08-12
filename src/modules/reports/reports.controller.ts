import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type IAuthenticatedUser } from '@common/auth';
import { ApiVersionEnum } from '@common/enums';
import { ErrorResponseDTO } from '@common/errors';
import { ReportQueryDTO } from './dto/report-query.dto';
import { ReportResponseDTO } from './dto/report-response.dto';
import { SeriesQueryDTO } from './dto/series-query.dto';
import { SeriesResponseDTO } from './dto/series-response.dto';
import { ReportsService } from './reports.service';

/**
 * Plan against actual, with variance.
 */
@ApiTags('Reports')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'The access token is missing, expired, or invalid.', type: ErrorResponseDTO })
@Controller({ path: 'reports', version: ApiVersionEnum.V1 })
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Builds the plan against actual report.
   *
   * @param user - The authenticated caller.
   * @param query - The range, filters, and paging.
   * @returns The rows and the totals for the range.
   */
  @Get('plan-vs-actual')
  @ApiOperation({
    summary: 'Plan against actual, with variance',
    description: `One row per category and month in the range, with the target, what was spent, and the difference.

**Variance** is \`actual - plan\`, so a negative number means under plan. **Variance percent** is \`(actual - plan) / plan * 100\` to two decimal places.

**When the plan is 0, \`variancePercent\` is \`null\`.** Never \`NaN\`, never \`Infinity\`, and never a fabricated 100%. Dividing by zero has no answer, and a client renders \`N/A\`. The absolute \`varianceMinor\` is still correct and still worth showing: it is the whole of the unplanned spend.

**A category with spend but no plan still appears.** That row is unplanned spend, which is usually the most interesting line in the report, and a naive join from the plan side would silently drop it.

**Missing actuals** follow \`?missingActuals=\`. Under \`zero\` (the default) a month with a target and nothing logged reports an actual of 0 and a variance of the whole target. Under \`null\` the actual, variance, and percent are all \`null\` so a client can render a dash. Either way \`hasActual\` says which happened, so a logged 0 is never confused with nothing logged.

**Totals cover the whole range, not the page.** They are computed in the same database pass as the rows, so the summary cannot disagree with the table beneath it or shift when the reader turns a page.`,
  })
  @ApiOkResponse({ description: 'The report.', type: ReportResponseDTO })
  @ApiBadRequestResponse({ description: 'The range ends before it starts, or a month is malformed.', type: ErrorResponseDTO })
  async planVsActual(@CurrentUser() user: IAuthenticatedUser, @Query() query: ReportQueryDTO): Promise<ReportResponseDTO> {
    return await this.reportsService.planVsActual(user.userId, query);
  }

  /**
   * Builds a chart series over the same numbers.
   *
   * @param user - The authenticated caller.
   * @param query - The range, filters, and axis.
   * @returns The points, in axis order.
   */
  @Get('plan-vs-actual/series')
  @ApiOperation({
    summary: 'The same numbers, shaped for a chart',
    description: `Collapses the report onto one axis: \`groupBy=month\` gives a point per month summed across categories, \`groupBy=category\` gives a point per category summed across the range.

Unpaginated, deliberately. A chart needs every point in the range, and one rebuilt from a page of table rows would draw a line that stops partway through the year.

It shares the aggregation with the table rather than reimplementing it, so a chart and the table beside it cannot disagree.`,
  })
  @ApiOkResponse({ description: 'The series.', type: SeriesResponseDTO })
  @ApiBadRequestResponse({ description: 'The range ends before it starts, or a month is malformed.', type: ErrorResponseDTO })
  async series(@CurrentUser() user: IAuthenticatedUser, @Query() query: SeriesQueryDTO): Promise<SeriesResponseDTO> {
    return await this.reportsService.series(user.userId, query);
  }
}
