import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AbstractDocument } from '@common/database';
import { CurrencyEnum } from '@common/enums';

/** Bounds on the month a fiscal year may start in. */
const FIRST_MONTH = 1;
const LAST_MONTH = 12;

/**
 * An account.
 *
 * @remarks
 * Extends {@link AbstractDocument} rather than the tenant owned base: a user is
 * the tenant, so there is no owner above it.
 *
 * @property email - Login identity, stored lowercase so lookups are case insensitive.
 * @property passwordHash - Argon2id hash. The password itself is never stored, logged, or returned.
 * @property currency - ISO 4217 code every amount on this account is denominated in.
 * @property fiscalYearStartMonth - Month a fiscal year starts, 1 through 12. January makes it the calendar year.
 */
@Schema({ timestamps: true, collection: 'users' })
export class User extends AbstractDocument {
  @Prop({ required: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true })
  passwordHash!: string;

  // `type: String` is required. The schema factory reads the emitted design type
  // to infer a field's type, and a TypeScript string enum does not emit one it
  // can use, so without this the schema fails to build at startup.
  @Prop({ type: String, required: true, default: CurrencyEnum.USD, uppercase: true, enum: Object.values(CurrencyEnum) })
  currency!: CurrencyEnum;

  @Prop({ required: true, default: FIRST_MONTH, min: FIRST_MONTH, max: LAST_MONTH })
  fiscalYearStartMonth!: number;
}

/** A hydrated user document. */
export type UserDocument = HydratedDocument<User>;

export const UserSchema = SchemaFactory.createForClass(User);

// Unique per live account, not globally. A partial index on deletedAt lets a
// deleted account's address be registered again, which a plain unique index
// would block forever given that nothing here is hard deleted.
UserSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
