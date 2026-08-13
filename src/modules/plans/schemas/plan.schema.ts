import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { TenantOwnedDocument } from '@common/database';
import { MONTH_PATTERN } from '@common/month';

/**
 * A monthly spending target for one category.
 *
 * @remarks
 * One plan per category per month, which the unique index enforces rather than a
 * check in application code. That is what makes setting a target idempotent: the
 * same cell written twice updates rather than duplicating, and a report summing
 * plans cannot double count.
 *
 * @property categoryId - The category this target is for.
 * @property month - The month it applies to, as `YYYY-MM`.
 * @property targetMinor - The target in minor units. Zero or positive.
 */
@Schema({ timestamps: true, collection: 'plans' })
export class Plan extends TenantOwnedDocument {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  categoryId!: Types.ObjectId;

  @Prop({ type: String, required: true, match: MONTH_PATTERN })
  month!: string;

  @Prop({ type: Number, required: true, min: 0 })
  targetMinor!: number;
}

/** A hydrated plan document. */
export type PlanDocument = HydratedDocument<Plan>;

export const PlanSchema = SchemaFactory.createForClass(Plan);

// One live target per user, category, and month. Partial on deletedAt so a
// deleted target can be set again, which a plain unique index would block
// forever given that nothing here is hard deleted.
PlanSchema.index({ userId: 1, categoryId: 1, month: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

// Equality on the owner, then range on the month: the order a date range scan
// wants, and the index the report aggregation reads.
PlanSchema.index({ userId: 1, month: 1 });
