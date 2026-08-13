import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsMongoId, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { MONTH_PATTERN } from '@common/month';
import { MAX_AMOUNT_MINOR, MIN_AMOUNT_MINOR, NOTE_MAX_LENGTH } from '../expenses.constants';

/**
 * Changes to an expense.
 *
 * @remarks
 * The month is changeable here, unlike on a plan. An expense genuinely lands in
 * the wrong month, usually because an invoice was dated differently from when it
 * was incurred, and correcting that is an edit rather than a different record.
 *
 * That is what makes the move check necessary: changing the month alters the
 * totals of two periods, and either may be closed.
 *
 * @property categoryId - Move the expense to a different category.
 * @property month - Move the expense to a different month.
 * @property amountMinor - Correct the amount.
 * @property note - Replace the note.
 */
export class UpdateExpenseDTO {
  @ApiPropertyOptional({ description: 'Move the expense to a different category.', example: '65f1c2d3e4b5a6c7d8e9f0a1' })
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Move the expense to a different month. Both the old and the new month must be open.',
    example: '2026-02',
  })
  @IsOptional()
  @IsString()
  @Matches(MONTH_PATTERN, { message: 'month must be in YYYY-MM format' })
  month?: string;

  @ApiPropertyOptional({ description: 'Correct the amount, in minor units.', example: 490_000 })
  @IsOptional()
  @IsInt()
  @Min(MIN_AMOUNT_MINOR)
  @Max(MAX_AMOUNT_MINOR)
  amountMinor?: number;

  @ApiPropertyOptional({
    description: 'Replace the note.',
    example: 'Corrected after credit note',
    maxLength: NOTE_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(NOTE_MAX_LENGTH)
  note?: string;
}
