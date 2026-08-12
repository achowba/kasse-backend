import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { ARGON2_OPTIONS } from './auth.constants';

/**
 * Hashes and verifies passwords.
 *
 * @remarks
 * Isolated from the rest of auth so the cost parameters live in one place and can
 * be raised as hardware improves, and so no other code is tempted to hash a
 * password itself.
 */
@Injectable()
export class PasswordService {
  /**
   * Hashes a password for storage.
   *
   * @param password - The plaintext password. Never logged, never stored.
   * @returns The encoded Argon2id hash, which carries its own salt and parameters.
   */
  async hash(password: string): Promise<string> {
    return await hash(password, ARGON2_OPTIONS);
  }

  /**
   * Checks a password against a stored hash.
   *
   * @remarks
   * A malformed or truncated stored hash makes the library throw. That is
   * answered with false rather than a 500: it means the credential does not
   * verify, and the caller should be told the same thing as any other bad
   * password rather than being told something is wrong with the account.
   *
   * @param storedHash - The encoded hash from the account.
   * @param password - The plaintext password to check.
   * @returns True when the password matches.
   */
  async verify(storedHash: string, password: string): Promise<boolean> {
    try {
      return await verify(storedHash, password);
    } catch {
      return false;
    }
  }
}
