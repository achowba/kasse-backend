import { Prop } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/**
 * Fields every document in this database carries.
 *
 * @remarks
 * `deletedAt` exists on everything because nothing here is ever hard deleted. A
 * delete sets it, and reads exclude it. It is indexed because every read filters
 * on it, so leaving it unindexed would make it the most expensive field in the
 * system rather than the cheapest.
 *
 * `_id`, `createdAt`, and `updatedAt` are declared for typing only. Mongoose
 * supplies them, and without a `@Prop` decorator the schema factory ignores them.
 *
 * @property _id - Document identifier, supplied by MongoDB.
 * @property deletedAt - When this record was soft deleted, or null while it is live.
 * @property createdAt - Set by the `timestamps` option on the concrete schema.
 * @property updatedAt - Set by the `timestamps` option on the concrete schema.
 */
export abstract class AbstractDocument {
  _id!: Types.ObjectId;

  @Prop({ type: Date, default: null, index: true })
  deletedAt!: Date | null;

  createdAt!: Date;

  updatedAt!: Date;
}
