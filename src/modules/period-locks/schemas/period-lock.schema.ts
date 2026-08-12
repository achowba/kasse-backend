import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { TenantOwnedDocument } from '@common/database';
import { MONTH_PATTERN } from '@common/month';

/**
 * A closed accounting period.
 *
 * @remarks
 * The month is the unit. Locking a quarter writes three of these, so one data
 * shape and one query answer both granularities, and a client can unlock a
 * single month of a locked quarter without a special case.
 *
 * The absence of a row is the unlocked state. There is no `locked` boolean and
 * no soft deleted lock: unlocking removes the row, because a lock is a fact about
 * a period rather than a record a user owns. That keeps the gate a single
 * existence check.
 *
 * @property month - The closed month, as `YYYY-MM`.
 * @property lockedAt - When it was closed.
 */
@Schema({ timestamps: true, collection: 'period_locks' })
export class PeriodLock extends TenantOwnedDocument {
  @Prop({ type: String, required: true, match: MONTH_PATTERN })
  month!: string;

  @Prop({ type: Date, required: true, default: (): Date => new Date() })
  lockedAt!: Date;
}

/** A hydrated period lock document. */
export type PeriodLockDocument = HydratedDocument<PeriodLock>;

export const PeriodLockSchema = SchemaFactory.createForClass(PeriodLock);

// One lock per month per account. The unique index is what makes locking the
// same month twice harmless rather than a source of duplicate rows, and it also
// serves the gate, which reads by user and month on every write in the system.
PeriodLockSchema.index({ userId: 1, month: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
