import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString, Matches } from 'class-validator';
import { MONTH_PATTERN } from '@common/month';
import { PaginationQueryDTO } from '@common/pagination';

/**
 * Filters for listing expenses.
 *
 * @remarks
 * The same filters serve report drill down. Clicking a report cell is a query
 * for one category in one month, which `categoryId` plus an equal `from` and
 * `to` already expresses, so there is no second endpoint to keep in step.
 *
 * @property from - First month of the range, inclusive.
 * @property to - Last month of the range, inclusive.
 * @property categoryId - Restrict to one category.
 * @property importBatchId - Restrict to the expenses one import wrote.
 */
export class ListExpensesQueryDTO extends PaginationQueryDTO {
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

  @ApiPropertyOptional({ description: 'Restrict to one category.', example: '65f1c2d3e4b5a6c7d8e9f0a1' })
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Restrict to the expenses one import wrote.',
    example: '65f1c2d3e4b5a6c7d8e9f0d1',
  })
  @IsOptional()
  @IsMongoId()
  importBatchId?: string;
}
