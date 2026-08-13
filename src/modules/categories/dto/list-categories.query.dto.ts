import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDTO } from '@common/pagination';

/**
 * Filters for listing categories.
 *
 * @property includeArchived - Whether to include categories hidden from pickers.
 */
export class ListCategoriesQueryDTO extends PaginationQueryDTO {
  @ApiPropertyOptional({
    description: 'Include categories that have been archived. Off by default, since a picker wants only selectable ones.',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  includeArchived?: boolean;
}
