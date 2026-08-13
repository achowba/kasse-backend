import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { BaseTenantRepository } from '@common/database';
import { ImportBatch, ImportBatchDocument } from './schemas/import-batch.schema';

/**
 * Data access for import batches.
 */
@Injectable()
export class ImportsRepository extends BaseTenantRepository<ImportBatch> {
  constructor(@InjectModel(ImportBatch.name) model: Model<ImportBatch>) {
    super(model);
  }

  /**
   * Finds the batch a key has already been used for.
   *
   * @remarks
   * The read that makes a replay cheap. The unique index is what makes it
   * correct: two identical uploads racing both miss this read, and the second
   * write is refused by the database rather than by a check neither of them saw.
   *
   * @param userId - The authenticated caller.
   * @param idempotencyKey - The key the client sent.
   * @returns The earlier batch, or null when this key is new.
   */
  async findByIdempotencyKey(userId: Types.ObjectId, idempotencyKey: string): Promise<ImportBatchDocument | null> {
    return await this.findOne(userId, { idempotencyKey });
  }

  /**
   * Lists an account's imports, newest first.
   *
   * @param userId - The authenticated caller.
   * @param limit - How many to return.
   * @param offset - How many to skip.
   * @returns The batches and the total.
   */
  async list(userId: Types.ObjectId, limit: number, offset: number): Promise<{ batches: ImportBatchDocument[]; total: number }> {
    const [batches, total] = await Promise.all([
      this.find(userId, {}, { sort: { createdAt: -1 }, skip: offset, limit }),
      this.count(userId, {}),
    ]);

    return { batches, total };
  }

  /**
   * Records an attempt, successful or not.
   *
   * @param userId - The authenticated caller.
   * @param batch - The batch to record.
   * @param session - Optional transaction session, so a successful batch commits with the rows it wrote.
   * @returns The stored batch.
   */
  async record(userId: Types.ObjectId, batch: Partial<ImportBatch>, session?: ClientSession): Promise<ImportBatchDocument> {
    return await this.create(userId, batch, session);
  }
}
