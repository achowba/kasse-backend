import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { UpdateMeDTO } from './dto/update-me.dto';
import { UserDocument } from './schemas/user.schema';
import { UsersRepository } from './users.repository';

/**
 * Account reads and settings changes.
 *
 * @remarks
 * Credentials are not handled here. Hashing and verification live in the auth
 * module, which owns that concern; this service stores and reads the hash it is
 * given.
 */
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  /**
   * Reads an account by id.
   *
   * @param userId - The account identifier.
   * @returns The account.
   * @throws NotFoundException When no live account has that id.
   */
  async getById(userId: Types.ObjectId): Promise<UserDocument> {
    const user = await this.usersRepository.findById(userId);

    if (user === null) {
      throw new NotFoundException('Account not found.');
    }

    return user;
  }

  /**
   * Reads an account by id, without throwing when it is absent.
   *
   * @remarks
   * For callers that must answer something other than a 404 when the account is
   * gone. Refresh uses it: a token for a deleted account is an authentication
   * failure, not a missing resource.
   *
   * @param userId - The account identifier.
   * @returns The account, or null when there is none.
   */
  async findById(userId: Types.ObjectId): Promise<UserDocument | null> {
    return await this.usersRepository.findById(userId);
  }

  /**
   * Reads an account by its login address.
   *
   * @param email - The address, in any case.
   * @returns The account, or null when there is none.
   */
  async findByEmail(email: string): Promise<UserDocument | null> {
    return await this.usersRepository.findByEmail(email);
  }

  /**
   * Reports whether an address is already registered to a live account.
   *
   * @param email - The address to check.
   * @returns True when the address is taken.
   */
  async isEmailTaken(email: string): Promise<boolean> {
    return await this.usersRepository.existsByEmail(email);
  }

  /**
   * Creates an account from an address and an already hashed password.
   *
   * @param email - The login address.
   * @param passwordHash - The Argon2id hash. This service never sees the password.
   * @param session - Optional transaction session.
   * @returns The created account.
   */
  async create(email: string, passwordHash: string, session?: ClientSession): Promise<UserDocument> {
    return await this.usersRepository.create(email, passwordHash, session);
  }

  /**
   * Replaces an account's password hash.
   *
   * @remarks
   * Takes a hash, never a password, exactly as {@link create} does. Hashing lives
   * in the auth module with the argon2 parameters, and this module owns the
   * collection. Splitting it that way keeps the cost parameters in one place and
   * means a plaintext password never reaches a service whose job is storage.
   *
   * Whether the caller is allowed to do this is decided before it is called.
   * This says nothing about proof of identity; it writes.
   *
   * @param id - The account identifier.
   * @param passwordHash - The new Argon2id hash.
   * @throws NotFoundException When no live account has that id.
   */
  /**
   * Moves an account to a different login address.
   *
   * @remarks
   * Uniqueness is not checked here, and that is deliberate rather than an
   * omission. A check followed by a write is two operations with a gap between
   * them, and two requests can both pass the check before either writes. The
   * partial unique index is the only thing that cannot be raced, so the caller
   * catches its error and turns it into a conflict.
   *
   * Whether the caller is allowed to do this is decided before it is called.
   * This says nothing about proof of identity; it writes.
   *
   * @param id - The account identifier.
   * @param email - The new login address.
   * @returns The updated account.
   * @throws NotFoundException When no live account has that id.
   * @throws Error With the duplicate key code when the address belongs to another live account.
   */
  async updateEmail(id: Types.ObjectId, email: string): Promise<UserDocument> {
    const updated = await this.usersRepository.updateEmail(id, email);

    if (updated === null) {
      throw new NotFoundException('Account not found.');
    }

    return updated;
  }

  /**
   * Replaces an account's password hash.
   *
   * @remarks
   * Takes a hash, never a password, exactly as {@link create} does. Hashing lives
   * in the auth module with the argon2 parameters, and this module owns the
   * collection. Splitting it that way keeps the cost parameters in one place and
   * means a plaintext password never reaches a service whose job is storage.
   *
   * Whether the caller is allowed to do this is decided before it is called.
   * This says nothing about proof of identity; it writes.
   *
   * @param id - The account identifier.
   * @param passwordHash - The new Argon2id hash.
   * @throws NotFoundException When no live account has that id.
   */
  async updatePassword(id: Types.ObjectId, passwordHash: string): Promise<void> {
    const updated = await this.usersRepository.updatePasswordHash(id, passwordHash);

    if (!updated) {
      throw new NotFoundException('Account not found.');
    }
  }

  /**
   * Changes the settings a user is allowed to change.
   *
   * @remarks
   * Changing the currency does not convert stored amounts. Amounts are minor
   * units with no currency of their own, so a change relabels them rather than
   * reinterpreting them, which is why it is worth stating in the API docs.
   *
   * @param userId - The account identifier.
   * @param changes - The settings to change.
   * @returns The updated account.
   * @throws NotFoundException When no live account has that id.
   */
  async updateSettings(userId: Types.ObjectId, changes: UpdateMeDTO): Promise<UserDocument> {
    const updated = await this.usersRepository.updateSettings(userId, changes);

    if (updated === null) {
      throw new NotFoundException('Account not found.');
    }

    return updated;
  }
}
