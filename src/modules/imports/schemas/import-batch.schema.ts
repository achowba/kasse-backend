import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';
import { TenantOwnedDocument } from '@common/database';
import { ImportStatusEnum } from '../imports.enums';

/**
 * One rejected row.
 *
 * @property line - The line in the uploaded file, counting the header as line 1.
 * @property column - Which column was wrong, or null when the row as a whole was.
 * @property message - What was wrong, in words a person editing a spreadsheet can act on.
 */
export interface IImportRowError {
  line: number;
  column: string | null;
  message: string;
}

/**
 * One attempt to import a file.
 *
 * @remarks
 * Written whether the import succeeded or failed. A failed batch is the record
 * that explains why nothing appeared, and without it a user who uploaded a bad
 * file has only an HTTP response they have already closed.
 *
 * The unique index on the account and the idempotency key is what makes a replay
 * safe. It is a database constraint rather than a check in the service, so two
 * requests arriving at once resolve in the database instead of both passing a
 * check and both writing.
 *
 * @property idempotencyKey - The client's key for this upload, unique per account.
 * @property filename - The uploaded file's name, for the user's own reference.
 * @property status - Whether the rows were written.
 * @property rowCount - How many data rows the file carried.
 * @property errorCount - How many were rejected.
 * @property rowErrors - The rejected rows, truncated past a limit. Named this way
 *   because `errors` is a reserved document property in Mongoose: a field with
 *   that name shadows the document's own validation errors, which is a collision
 *   that shows up as a warning now and as a confusing bug later. The API still
 *   calls it `errors`, since the response DTO does the mapping.
 * @property expenseCount - How many expenses this batch wrote.
 */
@Schema({ timestamps: true, collection: 'import_batches' })
export class ImportBatch extends TenantOwnedDocument {
  @Prop({ type: String, required: true })
  idempotencyKey!: string;

  @Prop({ type: String, required: true })
  filename!: string;

  @Prop({ type: String, required: true, enum: Object.values(ImportStatusEnum) })
  status!: ImportStatusEnum;

  @Prop({ type: Number, required: true, default: 0 })
  rowCount!: number;

  @Prop({ type: Number, required: true, default: 0 })
  errorCount!: number;

  @Prop({ type: SchemaTypes.Mixed, default: [] })
  rowErrors!: IImportRowError[];

  @Prop({ type: Number, required: true, default: 0 })
  expenseCount!: number;
}

/** A hydrated import batch document. */
export type ImportBatchDocument = HydratedDocument<ImportBatch>;

export const ImportBatchSchema = SchemaFactory.createForClass(ImportBatch);

// The replay guard. Partial on `deletedAt` for consistency with the rest of the
// project, though nothing soft deletes a batch: the trail of what was uploaded is
// the point of the record.
ImportBatchSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

// Listing an account's imports, newest first.
ImportBatchSchema.index({ userId: 1, createdAt: -1 });
