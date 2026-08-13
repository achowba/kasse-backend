import { ApiProperty } from '@nestjs/swagger';
import { ImportStatusEnum } from '../imports.enums';
import { IImportRowError, ImportBatchDocument } from '../schemas/import-batch.schema';

/**
 * One rejected row, as a client sees it.
 *
 * @property line - The line in the uploaded file. The header is line 1.
 * @property column - Which column was wrong, or null when the row as a whole was.
 * @property message - What was wrong, in words a person editing a spreadsheet can act on.
 */
export class ImportRowErrorDTO {
  @ApiProperty({ description: 'The line in the uploaded file. The header is line 1.', example: 7 })
  line!: number;

  @ApiProperty({ description: 'Which column was wrong.', example: 'month', nullable: true })
  column!: string | null;

  @ApiProperty({ description: 'What was wrong.', example: '"2026-13" is not a month in YYYY-MM format.' })
  message!: string;
}

/**
 * The outcome of one import.
 *
 * @property id - Identifier of the batch.
 * @property filename - The file that was uploaded.
 * @property status - Whether the rows were written.
 * @property rowCount - How many data rows the file carried.
 * @property errorCount - How many were rejected.
 * @property expenseCount - How many expenses the batch wrote.
 * @property errors - The rejected rows, in file order.
 * @property createdAt - When it was uploaded.
 */
export class ImportBatchResponseDTO {
  @ApiProperty({ description: 'Identifier of the batch.', example: '65f1c2d3e4b5a6c7d8e9f0d1' })
  id!: string;

  @ApiProperty({ description: 'The file that was uploaded.', example: 'january-expenses.csv' })
  filename!: string;

  @ApiProperty({ description: 'Whether the rows were written.', enum: ImportStatusEnum })
  status!: ImportStatusEnum;

  @ApiProperty({ description: 'How many data rows the file carried.', example: 120 })
  rowCount!: number;

  @ApiProperty({ description: 'How many rows were rejected.', example: 0 })
  errorCount!: number;

  @ApiProperty({ description: 'How many expenses this batch wrote. Zero when it failed.', example: 120 })
  expenseCount!: number;

  @ApiProperty({ description: 'The rejected rows, in file order.', type: [ImportRowErrorDTO] })
  errors!: ImportRowErrorDTO[];

  @ApiProperty({ description: 'When it was uploaded.', example: '2026-01-15T10:04:11.212Z', format: 'date-time' })
  createdAt!: string;

  /**
   * Maps a stored batch onto the response shape.
   *
   * @param batch - The stored batch.
   * @returns The batch, as a client sees it.
   */
  static fromDocument(batch: ImportBatchDocument): ImportBatchResponseDTO {
    return {
      id: batch._id.toString(),
      filename: batch.filename,
      status: batch.status,
      rowCount: batch.rowCount,
      errorCount: batch.errorCount,
      expenseCount: batch.expenseCount,
      // `rowErrors` on the document, `errors` on the wire. The rename exists to
      // avoid a reserved Mongoose property, not to change the API.
      errors: batch.rowErrors.map((error: IImportRowError) => ({ ...error })),
      createdAt: batch.createdAt.toISOString(),
    };
  }
}
