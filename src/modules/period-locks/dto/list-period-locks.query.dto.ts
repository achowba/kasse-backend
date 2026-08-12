import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { MONTH_PATTERN } from '@common/month';

/**
 * Range filter for listing closed periods.
 *
 * @remarks
 * Not paginated. A user has at most a handful of locked months per year, and a
 * client needs all of them at once to grey out the right rows in a report.
 *
 * @property from - First month of the range, inclusive.
 * @property to - Last month of the range, inclusive.
 */
export class ListPeriodLocksQueryDTO {
  @ApiPropertyOptional({ description: 'First month of the range, inclusive.', example: '2026-01' })
  @IsOptional()
  @IsString()
  @Matches(MONTH_PATTERN, { message: 'from must be in YYYY-MM format' })
  from?: string;

  @ApiPropertyOptional({ description: 'Last month of the range, inclusive.', example: '2026-12' })
  @IsOptional()
  @IsString()
  @Matches(MONTH_PATTERN, { message: 'to must be in YYYY-MM format' })
  to?: string;
}
