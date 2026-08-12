import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsMongoId, IsString, Matches, Max, Min } from 'class-validator';
import { MONTH_PATTERN } from '@common/month';
import { MAX_TARGET_MINOR } from '../plans.constants';

/**
 * A monthly target to set.
 *
 * @property categoryId - The category the target is for.
 * @property month - The month it applies to, as `YYYY-MM`.
 * @property targetMinor - The target in minor units.
 */
export class UpsertPlanDTO {
  @ApiProperty({ description: 'The category this target is for.', example: '65f1c2d3e4b5a6c7d8e9f0a1' })
  @IsMongoId()
  categoryId!: string;

  @ApiProperty({ description: 'The month the target applies to.', example: '2026-01', pattern: MONTH_PATTERN.source })
  @IsString()
  @Matches(MONTH_PATTERN, { message: 'month must be in YYYY-MM format' })
  month!: string;

  @ApiProperty({
    description:
      'The target in minor units. 5,000.00 is 500000. Zero is a meaningful target: it means nothing was planned, and any spend against it is reported as unplanned rather than as a percentage.',
    example: 500_000,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  @Max(MAX_TARGET_MINOR)
  targetMinor!: number;
}
