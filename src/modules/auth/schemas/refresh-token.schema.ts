import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { TenantOwnedDocument } from '@common/database';

/**
 * A refresh token, stored only as a hash.
 *
 * @remarks
 * The token itself is never stored. It is high entropy random data, so a fast
 * hash is the right choice: SHA-256 is deterministic, which allows the lookup by
 * hash that refresh needs, and there is no dictionary to attack. Argon2 is for
 * passwords, where the input is low entropy and slowness is the point.
 *
 * `familyId` links every token descended from one login. Rotation issues a new
 * token in the same family, so presenting an already rotated token proves the
 * chain leaked and the whole family can be revoked at once.
 *
 * This collection is one of the two documented exceptions to soft delete only:
 * a TTL index removes expired records, because a refresh token is transient
 * session state rather than data a user owns.
 *
 * @property tokenHash - SHA-256 of the token. Unique, and the lookup key on refresh.
 * @property familyId - Groups every token descended from one login.
 * @property expiresAt - When the token stops working. Also drives the TTL index.
 * @property revokedAt - When the token was rotated, logged out, or revoked. Null while live.
 * @property lastUsedAt - When the token was last exchanged. Null until first use.
 */
@Schema({ timestamps: true, collection: 'refresh_tokens' })
export class RefreshToken extends TenantOwnedDocument {
  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ required: true, type: SchemaTypes.ObjectId, index: true })
  familyId!: Types.ObjectId;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  @Prop({ type: Date, default: null })
  lastUsedAt!: Date | null;
}

/** A hydrated refresh token document. */
export type RefreshTokenDocument = HydratedDocument<RefreshToken>;

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

// Expired tokens are removed by the database rather than accumulating forever.
// This is a hard delete, and one of the two documented exceptions to the soft
// delete rule: the record is session state, not a user's data.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Serves the session list, which reads a user's live tokens.
RefreshTokenSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });
