import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SanitisedText } from '@common/text';
import { CATEGORY_NAME_MAX_LENGTH } from '../categories.constants';

/**
 * Changes to a category.
 *
 * @property name - A new display name.
 * @property archived - Whether to hide it from pickers.
 */
export class UpdateCategoryDTO {
  @ApiPropertyOptional({
    description: 'A new display name.',
    example: 'Cloud Infrastructure',
    minLength: 1,
    maxLength: CATEGORY_NAME_MAX_LENGTH,
  })
  @SanitisedText()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(CATEGORY_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Hide the category from pickers without removing it. Existing plans and expenses keep resolving it, and reports are unaffected.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
