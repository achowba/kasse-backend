import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseSourceEnum } from '../expenses.enums';
import { ExpenseDocument } from '../schemas/expense.schema';

/**
 * One logged expense.
 *
 * @property id - Identifier of the expense.
 * @property categoryId - The category it belongs to.
 * @property month - The month it belongs to.
 * @property amountMinor - The amount in minor units.
 * @property note - Free text, or null.
 * @property source - Whether it was entered by hand or imported.
 * @property importBatchId - The import that wrote it, or null.
 * @property createdAt - When it was logged.
 */
export class ExpenseResponseDTO {
  @ApiProperty({ description: 'Identifier of the expense.', example: '65f1c2d3e4b5a6c7d8e9f0c1' })
  id!: string;

  @ApiProperty({ description: 'The category it belongs to.', example: '65f1c2d3e4b5a6c7d8e9f0a1' })
  categoryId!: string;

  @ApiProperty({ description: 'The month it belongs to.', example: '2026-01' })
  month!: string;

  @ApiProperty({ description: 'The amount in minor units. Negative means money came back.', example: 480_000 })
  amountMinor!: number;

  @ApiPropertyOptional({ description: 'Free text.', example: 'Annual renewal', nullable: true })
  note!: string | null;

  @ApiProperty({ description: 'How it got here.', enum: ExpenseSourceEnum, example: ExpenseSourceEnum.MANUAL })
  source!: ExpenseSourceEnum;

  @ApiPropertyOptional({
    description: 'The import that wrote it, when it came from a file.',
    example: '65f1c2d3e4b5a6c7d8e9f0d1',
    nullable: true,
  })
  importBatchId!: string | null;

  @ApiProperty({ description: 'When it was logged.', example: '2026-01-15T10:04:11.212Z', format: 'date-time' })
  createdAt!: string;

  /**
   * Maps a stored expense onto the response shape.
   *
   * @param expense - The stored expense.
   * @returns The expense, as a client sees it.
   */
  static fromDocument(expense: ExpenseDocument): ExpenseResponseDTO {
    return {
      id: expense._id.toString(),
      categoryId: expense.categoryId.toString(),
      month: expense.month,
      amountMinor: expense.amountMinor,
      note: expense.note,
      source: expense.source,
      importBatchId: expense.importBatchId === null ? null : expense.importBatchId.toString(),
      createdAt: expense.createdAt.toISOString(),
    };
  }
}
