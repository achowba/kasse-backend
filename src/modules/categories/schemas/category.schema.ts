import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { AbstractDocument } from '@common/database';
import { CATEGORY_NAME_MAX_LENGTH } from '../categories.constants';

/**
 * A spending category.
 *
 * @remarks
 * Extends {@link AbstractDocument} rather than the tenant owned base, because a
 * category may have no owner: a row with `userId: null` belongs to the shared
 * catalogue every account can read. That is why this module has its own
 * repository instead of using `BaseTenantRepository`, which requires an owner.
 *
 * @property userId - The owning account, or null for a shared catalogue entry.
 * @property name - The name as the user wrote it, capitalisation preserved.
 * @property slug - Normalised comparison key. Uniqueness is on this, not the name.
 * @property archivedAt - When it was hidden from pickers, or null while selectable.
 */
@Schema({ timestamps: true, collection: 'categories' })
export class Category extends AbstractDocument {
  @Prop({ type: SchemaTypes.ObjectId, default: null, index: true })
  userId!: Types.ObjectId | null;

  @Prop({ type: String, required: true, trim: true, maxlength: CATEGORY_NAME_MAX_LENGTH })
  name!: string;

  @Prop({ type: String, required: true })
  slug!: string;

  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;
}

/** A hydrated category document. */
export type CategoryDocument = HydratedDocument<Category>;

export const CategorySchema = SchemaFactory.createForClass(Category);

// One live category per name per owner. Partial on deletedAt so a deleted name
// becomes available again, which a plain unique index would block forever given
// that nothing here is hard deleted. The shared catalogue is covered by the same
// index, with userId null.
CategorySchema.index({ userId: 1, slug: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

// Serves the list endpoint, which reads a user's own categories plus the shared
// catalogue, usually excluding archived ones.
CategorySchema.index({ userId: 1, archivedAt: 1, deletedAt: 1 });
