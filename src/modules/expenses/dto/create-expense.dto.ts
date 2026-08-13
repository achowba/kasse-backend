import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsMongoId, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { MONTH_PATTERN } from '@common/month';
import { MAX_AMOUNT_MINOR, MIN_AMOUNT_MINOR, NOTE_MAX_LENGTH } from '../expenses.constants';

/**
 * An expense to log.
 *
 * @property categoryId - The category the expense belongs to.
 * @property month - The month it belongs to, as `YYYY-MM`.
 * @property amountMinor - The amount in minor units.
 * @property note - Optional free text.
 */
export class CreateExpenseDTO {
  @ApiProperty({ description: 'The category the expense belongs to.', example: '65f1c2d3e4b5a6c7d8e9f0a1' })
  @IsMongoId()
  categoryId!: string;

  @ApiProperty({
    description:
      'The month the expense belongs to. An expense belongs to a month, not to a date, so nothing here is a timestamp.',
    example: '2026-01',
  })
  @IsString()
  @Matches(MONTH_PATTERN, { message: 'month must be in YYYY-MM format' })
  month!: string;

  @ApiProperty({
    description:
      'The amount in minor units. 4,800.00 is 480000. Negative is allowed and means money came back, such as a refund or a credit note.',
    example: 480_000,
  })
  @IsInt()
  @Min(MIN_AMOUNT_MINOR)
  @Max(MAX_AMOUNT_MINOR)
  amountMinor!: number;

  @ApiPropertyOptional({ description: 'Optional free text.', example: 'Annual renewal', maxLength: NOTE_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(NOTE_MAX_LENGTH)
  note?: string;
}
