import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

/**
 * Data access for accounts.
 *
 * @remarks
 * Does not extend {@link BaseTenantRepository}, because that base scopes every
 * query to an owning user and a user has no owner. The soft delete filter still
 * applies to every read here, written explicitly.
 */
@Injectable()
export class UsersRepository {
  constructor(@InjectModel(User.name) private readonly model: Model<User>) {}

  /**
   * Finds a live account by its login address.
   *
   * @param email - The address, in any case. Matched against the stored lowercase form.
   * @returns The account, or null when there is none.
   */
  async findByEmail(email: string): Promise<UserDocument | null> {
    return await this.model.findOne({ email: email.trim().toLowerCase(), deletedAt: null }).exec();
  }

  /**
   * Finds a live account by id.
   *
   * @param id - The account identifier.
   * @returns The account, or null when there is none.
   */
  async findById(id: Types.ObjectId): Promise<UserDocument | null> {
    return await this.model.findOne({ _id: id, deletedAt: null }).exec();
  }

  /**
   * Reports whether a live account already uses an address.
   *
   * @param email - The address to check.
   * @returns True when the address is taken.
   */
  async existsByEmail(email: string): Promise<boolean> {
    return (await this.model.exists({ email: email.trim().toLowerCase(), deletedAt: null })) !== null;
  }

  /**
   * Creates an account.
   *
   * @param email - The login address.
   * @param passwordHash - The Argon2id hash of the password.
   * @param session - Optional transaction session.
   * @returns The created account.
   */
  async create(email: string, passwordHash: string, session?: ClientSession): Promise<UserDocument> {
    const user = new this.model({ email: email.trim().toLowerCase(), passwordHash, deletedAt: null });

    return await user.save({ session });
  }

  /**
   * Updates the settings a user is allowed to change.
   *
   * @param id - The account identifier.
   * @param changes - The fields to change.
   * @returns The updated account, or null when there is none.
   */
  async updateSettings(
    id: Types.ObjectId,
    changes: Partial<Pick<User, 'currency' | 'fiscalYearStartMonth'>>,
  ): Promise<UserDocument | null> {
    return await this.model
      .findOneAndUpdate({ _id: id, deletedAt: null }, { $set: changes }, { new: true, runValidators: true })
      .exec();
  }
}
