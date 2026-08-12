import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { MAX_TARGET_MINOR } from '../plans.constants';

/**
 * A change to an existing target.
 *
 * @remarks
 * Only the amount. Moving a target to a different category or month is not an
 * edit, it is a different cell: it would silently vacate one cell and overwrite
 * another, and either end could be in a closed period. Set the new cell and
 * delete the old one, so both go through their own lock check.
 *
 * @property targetMinor - The new target in minor units.
 */
export class UpdatePlanDTO {
  @ApiProperty({ description: 'The new target in minor units. 5,000.00 is 500000.', example: 600_000, minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(MAX_TARGET_MINOR)
  targetMinor!: number;
}
