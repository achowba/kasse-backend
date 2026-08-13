import { ApiProperty } from '@nestjs/swagger';
import { CategoryDocument } from '../schemas/category.schema';

/**
 * A category, as returned to a caller who can select it.
 *
 * @property id - Identifier, used when creating a plan or an actual.
 * @property name - The name as written.
 * @property shared - Whether it comes from the shared catalogue. Shared categories cannot be changed.
 * @property archived - Whether it is hidden from pickers while remaining selectable in history.
 */
export class CategoryResponseDTO {
  @ApiProperty({ description: 'Identifier, used when creating a plan or an actual.', example: '65f1c2d3e4b5a6c7d8e9f0a1' })
  id!: string;

  @ApiProperty({ description: 'The name as written.', example: 'Cloud Hosting' })
  name!: string;

  @ApiProperty({
    description:
      'Whether this comes from the shared catalogue. Shared categories are readable by every account and editable by none.',
    example: false,
  })
  shared!: boolean;

  @ApiProperty({
    description: 'Whether it is hidden from pickers. An archived category still resolves in existing plans and reports.',
    example: false,
  })
  archived!: boolean;

  /**
   * Maps a stored category onto the response shape.
   *
   * @remarks
   * Reports `shared` rather than exposing the owner id. A client needs to know
   * whether it may edit the category, not who owns it, and the owner is always
   * either the caller or nobody.
   *
   * @param category - The stored category.
   * @returns The category, as a client sees it.
   */
  static fromDocument(category: CategoryDocument): CategoryResponseDTO {
    return {
      id: category._id.toString(),
      name: category.name,
      shared: category.userId === null,
      archived: category.archivedAt !== null,
    };
  }
}
