import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { TenantOwnedDocument } from '@common/database';
import { AuditActionEnum, AuditEntityEnum } from '../audit-log.enums';

/**
 * One recorded change to financial data.
 *
 * @remarks
 * Append only. Nothing in this service updates or deletes an entry, softly or
 * otherwise: a trail that can be edited is not a trail. It is also the one
 * collection where `deletedAt` exists but is never set, inherited from the
 * document base for consistency.
 *
 * No IP address and no user agent. They are personal identifiers, and the trail's
 * job is to answer what changed and by which account, which neither contributes
 * to.
 *
 * @property action - What happened.
 * @property entity - What kind of record it happened to.
 * @property entityId - Which record. Absent for an action with no single subject.
 * @property before - The record's state before the change. Absent on a creation.
 * @property after - The record's state after the change. Absent on a deletion.
 * @property requestId - The request that made the change, matching the logs and the error envelope.
 * @property at - When it happened.
 */
@Schema({ timestamps: true, collection: 'audit_entries' })
export class AuditEntry extends TenantOwnedDocument {
  @Prop({ type: String, required: true, enum: Object.values(AuditActionEnum), index: true })
  action!: AuditActionEnum;

  @Prop({ type: String, required: true, enum: Object.values(AuditEntityEnum), index: true })
  entity!: AuditEntityEnum;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  entityId!: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  before!: Record<string, unknown> | null;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  after!: Record<string, unknown> | null;

  @Prop({ type: String, default: null })
  requestId!: string | null;

  @Prop({ type: Date, required: true, default: (): Date => new Date() })
  at!: Date;
}

/** A hydrated audit entry document. */
export type AuditEntryDocument = HydratedDocument<AuditEntry>;

export const AuditEntrySchema = SchemaFactory.createForClass(AuditEntry);

// The trail is read newest first, filtered by user and optionally by entity.
AuditEntrySchema.index({ userId: 1, at: -1 });
AuditEntrySchema.index({ userId: 1, entity: 1, entityId: 1, at: -1 });
