import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { SanitisedText } from '@common/text';
import { CATEGORY_NAME_MAX_LENGTH } from '../categories.constants';

/**
 * A category to create.
 *
 * @property name - The name as it should be displayed.
 */
export class CreateCategoryDTO {
  @ApiProperty({
    description:
      'Name as it should be displayed. Uniqueness is checked case and spacing insensitively, so "Cloud Hosting" and "cloud  hosting" are the same category.',
    example: 'Cloud Hosting',
    minLength: 1,
    maxLength: CATEGORY_NAME_MAX_LENGTH,
  })
  @SanitisedText()
  @IsString()
  @MinLength(1)
  @MaxLength(CATEGORY_NAME_MAX_LENGTH)
  name!: string;
}
