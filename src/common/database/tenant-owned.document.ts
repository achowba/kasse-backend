import { Prop } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { AbstractDocument } from './abstract.document';

/**
 * A document owned by exactly one user.
 *
 * @remarks
 * Everything except the shared category catalogue extends this. Pairing it with
 * {@link BaseTenantRepository} is what makes tenant isolation structural: a
 * repository over this type cannot express a query that is not scoped to an
 * owner, so no handler can leak another account's records by forgetting a filter.
 *
 * @property userId - The owning user. Indexed because it is in every query.
 */
export abstract class TenantOwnedDocument extends AbstractDocument {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;
}
