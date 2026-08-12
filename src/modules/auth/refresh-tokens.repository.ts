import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { BaseTenantRepository } from '@common/database';
import { RefreshToken, RefreshTokenDocument } from './schemas/refresh-token.schema';

/**
 * Data access for refresh tokens.
 *
 * @remarks
 * Extends the tenant scoped base for everything a signed in user does with their
 * own sessions. {@link RefreshTokensRepository.findByHash} is the deliberate
 * exception, explained on the method.
 */
@Injectable()
export class RefreshTokensRepository extends BaseTenantRepository<RefreshToken> {
  constructor(@InjectModel(RefreshToken.name) model: Model<RefreshToken>) {
    super(model);
  }

  /**
   * Finds a token by its hash, across every account.
   *
   * @remarks
   * The one read here that is not scoped to a user, and deliberately so: at
   * refresh time the token is the only thing the caller has presented, so there
   * is no authenticated user yet to scope by. The hash is 256 bits of random
   * data, so it identifies the account rather than being guessable.
   *
   * Returns revoked tokens too. That is what makes reuse detection possible: a
   * presented token that is already revoked means the chain leaked.
   *
   * @param tokenHash - SHA-256 of the presented token.
   * @returns The token record, or null when no such token exists.
   */
  async findByHash(tokenHash: string): Promise<RefreshTokenDocument | null> {
    return await this.model.findOne({ tokenHash }).exec();
  }

  /**
   * Issues a token record.
   *
   * @param userId - The owning account.
   * @param tokenHash - SHA-256 of the token handed to the client.
   * @param familyId - The rotation chain this token belongs to.
   * @param expiresAt - When it stops working.
   * @param session - Optional transaction session.
   * @returns The stored record.
   */
  async issue(
    userId: Types.ObjectId,
    tokenHash: string,
    familyId: Types.ObjectId,
    expiresAt: Date,
    session?: ClientSession,
  ): Promise<RefreshTokenDocument> {
    return await this.create(userId, { tokenHash, familyId, expiresAt, revokedAt: null, lastUsedAt: null }, session);
  }

  /**
   * Revokes one token.
   *
   * @param userId - The owning account.
   * @param id - The token record.
   * @param session - Optional transaction session.
   * @returns True when a live token was revoked.
   */
  async revoke(userId: Types.ObjectId, id: Types.ObjectId, session?: ClientSession): Promise<boolean> {
    const result = await this.model
      .updateOne({ _id: id, userId, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session })
      .exec();

    return result.modifiedCount > 0;
  }

  /**
   * Revokes every live token in a rotation chain.
   *
   * @remarks
   * Called when a already rotated token is presented again. That means the chain
   * leaked, and the safe response is to end every session descended from that
   * login rather than only the one presented.
   *
   * @param userId - The owning account.
   * @param familyId - The chain to end.
   * @param session - Optional transaction session.
   * @returns How many tokens were revoked.
   */
  async revokeFamily(userId: Types.ObjectId, familyId: Types.ObjectId, session?: ClientSession): Promise<number> {
    const result = await this.model
      .updateMany({ userId, familyId, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session })
      .exec();

    return result.modifiedCount;
  }

  /**
   * Revokes every live token for an account, optionally sparing one.
   *
   * @param userId - The owning account.
   * @param exceptId - A token to leave alone, so a user can end other sessions without ending their own.
   * @returns How many tokens were revoked.
   */
  async revokeAll(userId: Types.ObjectId, exceptId?: Types.ObjectId): Promise<number> {
    const filter = exceptId === undefined ? { userId, revokedAt: null } : { userId, revokedAt: null, _id: { $ne: exceptId } };

    const result = await this.model.updateMany(filter, { $set: { revokedAt: new Date() } }).exec();

    return result.modifiedCount;
  }

  /**
   * Lists the sessions a user currently has.
   *
   * @param userId - The owning account.
   * @returns Live, unexpired tokens, newest first.
   */
  async listActive(userId: Types.ObjectId): Promise<RefreshTokenDocument[]> {
    return await this.model
      .find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Records that a token was exchanged.
   *
   * @param id - The token record.
   * @param session - Optional transaction session.
   */
  async markUsed(id: Types.ObjectId, session?: ClientSession): Promise<void> {
    await this.model.updateOne({ _id: id }, { $set: { lastUsedAt: new Date() } }, { session }).exec();
  }
}
