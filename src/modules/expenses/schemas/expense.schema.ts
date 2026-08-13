import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { TenantOwnedDocument } from '@common/database';
import { MONTH_PATTERN } from '@common/month';
import { NOTE_MAX_LENGTH } from '../expenses.constants';
import { ExpenseSourceEnum } from '../expenses.enums';

/**
 * One amount spent against a category in a month.
 *
 * @remarks
 * An expense is a single line item. The report sums a category's expenses for a
 * month into the figure it calls spend, which is why there is no uniqueness
 * rule here and deliberately so: a month's spend on a category is many expenses.
 * One record per cell would force a client to read, add, and write back, which
 * loses an entry whenever two people log at once.
 *
 * @property categoryId - The category the expense belongs to.
 * @property month - The month it belongs to, as `YYYY-MM`.
 * @property amountMinor - The amount in minor units. May be negative for a refund.
 * @property note - Optional free text.
 * @property source - Whether it was entered by hand or imported.
 * @property importBatchId - The import that wrote it, when it came from a file.
 */
@Schema({ timestamps: true, collection: 'expenses' })
export class Expense extends TenantOwnedDocument {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  categoryId!: Types.ObjectId;

  @Prop({ type: String, required: true, match: MONTH_PATTERN })
  month!: string;

  @Prop({ type: Number, required: true })
  amountMinor!: number;

  @Prop({ type: String, default: null, maxlength: NOTE_MAX_LENGTH, trim: true })
  note!: string | null;

  @Prop({ type: String, required: true, enum: Object.values(ExpenseSourceEnum), default: ExpenseSourceEnum.MANUAL })
  source!: ExpenseSourceEnum;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  importBatchId!: Types.ObjectId | null;
}

/** A hydrated expense document. */
export type ExpenseDocument = HydratedDocument<Expense>;

export const ExpenseSchema = SchemaFactory.createForClass(Expense);

// Equality on the owner, then range on the month, then the category filter: the
// order a date range scan wants, and the index the report aggregation reads.
ExpenseSchema.index({ userId: 1, month: 1, categoryId: 1 });

// Serves reading back or undoing everything one import wrote.
ExpenseSchema.index({ userId: 1, importBatchId: 1 });
