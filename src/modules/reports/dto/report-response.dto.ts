import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDTO } from '@common/pagination';

/**
 * One row of the report: a category in a month, with both sides and the variance.
 *
 * @property categoryId - The category.
 * @property categoryName - Its name, so a client can render a row without a second request.
 * @property month - The month, as `YYYY-MM`.
 * @property planMinor - The target in minor units. 0 when nothing was planned.
 * @property spentMinor - Logged spend in minor units. Null only under the `null` policy.
 * @property varianceMinor - `spend - plan`. Negative means under plan.
 * @property variancePercent - The variance as a percentage of the plan. Null when the plan is 0.
 * @property hasPlan - Whether a target exists, so a target of 0 is not read as no target.
 * @property hasSpend - Whether anything was logged, so logged 0 is not read as nothing logged.
 */
export class ReportRowDTO {
  @ApiProperty({ description: 'The category.', example: '65f1c2d3e4b5a6c7d8e9f0a1' })
  categoryId!: string;

  @ApiProperty({ description: 'The category name.', example: 'Marketing' })
  categoryName!: string;

  @ApiProperty({ description: 'The month.', example: '2026-01' })
  month!: string;

  @ApiProperty({ description: 'The target, in minor units.', example: 500_000 })
  planMinor!: number;

  @ApiPropertyOptional({
    description: 'Logged spend, in minor units. Null only when nothing was logged and the policy is `null`.',
    example: 480_000,
    nullable: true,
  })
  spentMinor!: number | null;

  @ApiPropertyOptional({
    description: 'Spend minus plan. Negative means under plan.',
    example: -20_000,
    nullable: true,
  })
  varianceMinor!: number | null;

  @ApiPropertyOptional({
    description:
      'The variance as a percentage of the plan, to two decimal places. **Null when the plan is 0**, because dividing by zero has no answer. Never `NaN` and never `Infinity`.',
    example: -4,
    nullable: true,
  })
  variancePercent!: number | null;

  @ApiProperty({ description: 'Whether a target exists. A target of 0 is not the same as no target.', example: true })
  hasPlan!: boolean;

  @ApiProperty({ description: 'Whether anything was logged. Logged 0 is not the same as nothing logged.', example: true })
  hasSpend!: boolean;
}

/**
 * Both sides summed over the whole range, and the variance between them.
 *
 * @property planMinor - Every target in range.
 * @property spentMinor - Every expense in range.
 * @property varianceMinor - Spend minus plan across the range.
 * @property variancePercent - The variance as a percentage of the total plan. Null when that is 0.
 */
export class ReportTotalsDTO {
  @ApiProperty({ description: 'Every target in range, in minor units.', example: 2_500_000 })
  planMinor!: number;

  @ApiProperty({ description: 'Every expense in range, in minor units.', example: 2_530_000 })
  spentMinor!: number;

  @ApiProperty({ description: 'Spend minus plan across the range.', example: 30_000 })
  varianceMinor!: number;

  @ApiPropertyOptional({
    description: 'The variance as a percentage of the total plan. Null when the total plan is 0.',
    example: 1.2,
    nullable: true,
  })
  variancePercent!: number | null;
}

/**
 * The report: a page of rows, and the totals for the whole range.
 *
 * @remarks
 * The totals are computed over the entire range rather than the page, in the same
 * database pass. A summary that only added up the visible rows would change every
 * time the reader turned a page, which is the bug this shape exists to prevent.
 *
 * @property items - The rows on this page.
 * @property totals - Both sides summed across the whole range, not just this page.
 * @property pagination - Where this page sits in the whole result set.
 */
export class ReportResponseDTO {
  @ApiProperty({ description: 'The rows on this page.', type: [ReportRowDTO] })
  items!: ReportRowDTO[];

  @ApiProperty({ description: 'Totals across the whole range, not just this page.', type: ReportTotalsDTO })
  totals!: ReportTotalsDTO;

  @ApiProperty({ description: 'Where this page sits in the whole result set.', type: PaginationDTO })
  pagination!: PaginationDTO;
}
