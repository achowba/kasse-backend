import { ApiProperty } from '@nestjs/swagger';
import { PlanDocument } from '../schemas/plan.schema';

/**
 * A monthly target.
 *
 * @remarks
 * Carries the category id rather than its name. Resolving names here would mean
 * a lookup per row, and a client listing targets already holds the category list
 * it rendered its picker from. The report endpoint does include names, because
 * there the join happens once inside the aggregation.
 *
 * @property id - Identifier of the target.
 * @property categoryId - The category this target is for.
 * @property month - The month it applies to.
 * @property targetMinor - The target in minor units.
 */
export class PlanResponseDTO {
  @ApiProperty({ description: 'Identifier of the target.', example: '65f1c2d3e4b5a6c7d8e9f0b1' })
  id!: string;

  @ApiProperty({ description: 'The category this target is for.', example: '65f1c2d3e4b5a6c7d8e9f0a1' })
  categoryId!: string;

  @ApiProperty({ description: 'The month it applies to.', example: '2026-01' })
  month!: string;

  @ApiProperty({ description: 'The target in minor units. 5,000.00 is 500000.', example: 500_000 })
  targetMinor!: number;

  /**
   * Maps a stored target onto the response shape.
   *
   * @param plan - The stored target.
   * @returns The target, as a client sees it.
   */
  static fromDocument(plan: PlanDocument): PlanResponseDTO {
    return {
      id: plan._id.toString(),
      categoryId: plan.categoryId.toString(),
      month: plan.month,
      targetMinor: plan.targetMinor,
    };
  }
}
