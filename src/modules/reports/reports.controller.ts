import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser, type IAuthenticatedUser } from '@common/auth';
import { ApiVersionEnum } from '@common/enums';
import { ErrorResponseDTO } from '@common/errors';
import { EXPENSIVE_THROTTLE_TTL_MS, REPORT_THROTTLE_LIMIT } from '@common/throttling';
import { ReportQueryDTO } from './dto/report-query.dto';
import { ReportResponseDTO } from './dto/report-response.dto';
import { SeriesQueryDTO } from './dto/series-query.dto';
import { SeriesResponseDTO } from './dto/series-response.dto';
import { ReportsService } from './reports.service';

/**
 * Plan against spend, with variance.
 */
@ApiTags('Reports')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'The access token is missing, expired, or invalid.', type: ErrorResponseDTO })
@Controller({ path: 'reports', version: ApiVersionEnum.V1 })
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Builds the plan against spend report.
   *
   * @param user - The authenticated caller.
   * @param query - The range, filters, and paging.
   * @returns The rows and the totals for the range.
   */
  @Get('plan-vs-spend')
  @Throttle({ default: { limit: REPORT_THROTTLE_LIMIT, ttl: EXPENSIVE_THROTTLE_TTL_MS } })
  @ApiOperation({
    summary: 'Plan against spend, with variance',
    description: `One row per category and month in the range, with the target, what was spent, and the difference.

**Variance** is \`spend - plan\`, so a negative number means under plan. **Variance percent** is \`(spend - plan) / plan * 100\` to two decimal places.

**When the plan is 0, \`variancePercent\` is \`null\`.** Never \`NaN\`, never \`Infinity\`, and never a fabricated 100%. Dividing by zero has no answer, and a client renders \`N/A\`. The absolute \`varianceMinor\` is still correct and still worth showing: it is the whole of the unplanned spend.

**A category with spend but no plan still appears.** That row is unplanned spend, which is usually the most interesting line in the report, and a naive join from the plan side would silently drop it.

**Missing spend** follow \`?missingSpend=\`. Under \`zero\` (the default) a month with a target and nothing logged reports spend of 0 and a variance of the whole target. Under \`null\` the spend, variance, and percent are all \`null\` so a client can render a dash. Either way \`hasSpend\` says which happened, so a logged 0 is never confused with nothing logged.

**Totals cover the whole range, not the page.** They are computed in the same database pass as the rows, so the summary cannot disagree with the table beneath it or shift when the reader turns a page.`,
  })
  @ApiOkResponse({ description: 'The report.', type: ReportResponseDTO })
  @ApiBadRequestResponse({ description: 'The range ends before it starts, or a month is malformed.', type: ErrorResponseDTO })
  async planVsSpend(@CurrentUser() user: IAuthenticatedUser, @Query() query: ReportQueryDTO): Promise<ReportResponseDTO> {
    return await this.reportsService.planVsSpend(user.userId, query);
  }

  /**
   * Builds a chart series over the same numbers.
   *
   * @param user - The authenticated caller.
   * @param query - The range, filters, and axis.
   * @returns The points, in axis order.
   */
  @Get('plan-vs-spend/series')
  @Throttle({ default: { limit: REPORT_THROTTLE_LIMIT, ttl: EXPENSIVE_THROTTLE_TTL_MS } })
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

  /**
   * Downloads the report as a CSV file.
   *
   * @param user - The authenticated caller.
   * @param query - The range and filters.
   * @param response - The HTTP response, so the file headers can be set.
   */
  @Get('plan-vs-spend/export')
  @Throttle({ default: { limit: REPORT_THROTTLE_LIMIT, ttl: EXPENSIVE_THROTTLE_TTL_MS } })
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Download the report as CSV',
    description: `The same report as a file, with a labelled totals row appended.

Amounts are written in major units the way a person writes them, \`4800.00\`, with no currency symbol and no thousands separator, so a spreadsheet reads the column as a number rather than as text.

A variance percentage with no answer, which is what a plan of zero produces, is written as \`-\` rather than as \`NaN\` or left blank. A blank cell reads as missing data; a dash reads as deliberate.

Built from the same call that serves the JSON report, so the file and the table on screen cannot disagree, and a download straight after viewing is served from the same cached result.`,
  })
  @ApiOkResponse({
    description: 'The report as CSV.',
    content: { 'text/csv': { schema: { type: 'string' } } },
  })
  @ApiBadRequestResponse({ description: 'The range ends before it starts, or a month is malformed.', type: ErrorResponseDTO })
  async exportCsv(
    @CurrentUser() user: IAuthenticatedUser,
    @Query() query: ReportQueryDTO,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { csv, filename } = await this.reportsService.exportCsv(user.userId, query);

    response.set({
      'Content-Type': 'text/csv; charset=utf-8',
      // `attachment` rather than `inline`, so a browser saves the file instead of
      // rendering it as text in a tab.
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    return new StreamableFile(Buffer.from(csv, 'utf8'));
  }
}
