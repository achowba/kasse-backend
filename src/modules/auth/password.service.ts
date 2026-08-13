import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2 parameters.
 *
 * @remarks
 * The OWASP baseline: 19 MiB of memory, two iterations, one lane. Memory hardness
 * is what makes a stolen hash expensive to attack on a GPU, which a fast hash
 * like SHA-256 does not provide for an input as low in entropy as a password.
 *
 * The algorithm is deliberately not set here. This library's `Algorithm` enum is
 * an ambient const enum, which `isolatedModules` cannot read, and hardcoding its
 * numeric value would break silently if the library renumbered it. Argon2id is
 * the library default, and a test asserts the produced hash carries the
 * `$argon2id$` marker, so a change in that default fails loudly rather than
 * quietly downgrading every password to a weaker variant.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

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
