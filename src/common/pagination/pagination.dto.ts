import { ApiProperty } from '@nestjs/swagger';
import { IPagination } from './paginated-response';

/**
 * Where a page sits in the whole result set, as a documented response shape.
 *
 * @remarks
 * The same fields as {@link IPagination}, as a class rather than an interface.
 * An interface is erased at compile time, so it cannot be the declared type of a
 * decorated property: Swagger would have nothing to read and the emitted
 * decorator metadata would not compile under `isolatedModules`. A response DTO
 * that nests pagination declares this instead.
 *
 * @property limit - How many records were requested.
 * @property offset - How many records were skipped.
 * @property total - How many records match the filter, across every page.
 */
export class PaginationDTO implements IPagination {
  @ApiProperty({ description: 'How many records were requested.', example: 50 })
  limit!: number;

  @ApiProperty({ description: 'How many records were skipped.', example: 0 })
  offset!: number;

  @ApiProperty({ description: 'How many records match the filter, across every page.', example: 4 })
  total!: number;
}
