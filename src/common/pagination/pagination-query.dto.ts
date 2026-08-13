import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '@common/constants';

/**
 * Query parameters every list endpoint accepts.
 *
 * @remarks
 * Offset paging rather than cursor paging. The collections here are a user's own
 * categories, plans, and actuals, which are small and are read with a sort the
 * user chose, so the cost of a large offset never arises. A cursor would buy
 * stability under concurrent writes that this data does not experience.
 *
 * The maximum is enforced here rather than in each handler, so no endpoint can
 * be talked into an unbounded read.
 *
 * @property limit - How many records to return.
 * @property offset - How many records to skip.
 */
export class PaginationQueryDTO {
  @ApiPropertyOptional({
    description: 'How many records to return.',
    minimum: 1,
    maximum: MAX_PAGE_LIMIT,
    default: DEFAULT_PAGE_LIMIT,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit: number = DEFAULT_PAGE_LIMIT;

  @ApiPropertyOptional({ description: 'How many records to skip.', minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset: number = 0;
}
