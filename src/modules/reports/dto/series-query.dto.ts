import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { SeriesGroupByEnum } from '../reports.enums';
import { ReportQueryDTO } from './report-query.dto';

/**
 * The range and axis of a chart series.
 *
 * @remarks
 * Takes the report's filters minus pagination and the missing spend policy. A
 * series is unpaginated by design, and a chart plots a summed line where a
 * missing month is simply a lower point, so the policy has nothing to change.
 *
 * @property groupBy - Whether each point is a month or a category.
 */
export class SeriesQueryDTO extends OmitType(ReportQueryDTO, ['limit', 'offset', 'missingSpend'] as const) {
  @ApiPropertyOptional({
    description: 'Whether each point is a month or a category.',
    enum: SeriesGroupByEnum,
    default: SeriesGroupByEnum.MONTH,
  })
  @IsOptional()
  @IsEnum(SeriesGroupByEnum)
  groupBy?: SeriesGroupByEnum;
}
