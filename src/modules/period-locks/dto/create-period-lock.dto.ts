import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, Matches } from 'class-validator';
import { MONTH_PATTERN, QUARTER_PATTERN } from '@common/month';

/** Most months one request may close at once. A year and a quarter of slack. */
const MAX_MONTHS_PER_REQUEST = 15;

/**
 * The periods to close.
 *
 * @remarks
 * Either a list of months or a quarter, not both. A quarter is a convenience:
 * it expands to its three months, so the stored shape stays one row per month
 * and a single month of a locked quarter can be reopened without a special case.
 *
 * @property months - Months to close, as `YYYY-MM`.
 * @property quarter - A quarter to close, as `YYYY-Q1` through `YYYY-Q4`.
 */
export class CreatePeriodLockDTO {
  @ApiPropertyOptional({
    description: 'Months to close, each as YYYY-MM. Locking a month that is already closed is harmless.',
    example: ['2026-01', '2026-02'],
    type: [String],
    maxItems: MAX_MONTHS_PER_REQUEST,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_MONTHS_PER_REQUEST)
  @IsString({ each: true })
  @Matches(MONTH_PATTERN, { each: true, message: 'each month must be in YYYY-MM format' })
  months?: string[];

  @ApiPropertyOptional({
    description: 'A calendar quarter to close, which expands to its three months. Q1 is January through March.',
    example: '2026-Q1',
  })
  @IsOptional()
  @IsString()
  @Matches(QUARTER_PATTERN, { message: 'quarter must be in YYYY-Q1 through YYYY-Q4 format' })
  quarter?: string;
}
