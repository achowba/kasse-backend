import { registerAs } from '@nestjs/config';
import { DEFAULT_ACCESS_TTL_SECONDS, DEFAULT_REFRESH_TTL_DAYS } from './config.constants';
import { IAuthConfig } from './config.interface';

/**
 * Decodes a base64 encoded PEM key.
 *
 * @remarks
 * Keys travel base64 encoded because a PEM contains newlines and an environment
 * variable is a single line. Encoding avoids the usual workaround of embedding
 * escaped newlines, which every deployment platform mangles differently.
 *
 * @param encoded - The base64 encoded key, or undefined when unset.
 * @returns The decoded PEM, or an empty string when unset.
 */
const decodeKey = (encoded: string | undefined): string =>
  encoded === undefined || encoded === '' ? '' : Buffer.from(encoded, 'base64').toString('utf8');

/**
 * Builds the `auth` configuration namespace from the validated environment.
 *
 * @remarks
 * Both lifetimes are numbers rather than duration strings such as `15m`. The
 * refresh lifetime is used twice, to compute an expiry date and by the TTL index,
 * and both want a number. The access lifetime is handed to the JWT signer, whose
 * types accept a number or a narrow template literal, so a number avoids a cast
 * that would only exist to satisfy the type checker.
 *
 * @returns The resolved authentication configuration.
 */
export const authConfig = registerAs('auth', (): IAuthConfig => ({
  privateKey: decodeKey(process.env['JWT_PRIVATE_KEY']),
  // No default. Validation refuses an absent value at boot, so a fallback
  // here would only ever mask a variable somebody forgot to set.
  issuer: process.env['TOKEN_ISSUER'] ?? '',
  publicKey: decodeKey(process.env['JWT_PUBLIC_KEY']),
  algorithm: 'RS256',
  accessTtlSeconds: Number(process.env['JWT_ACCESS_TTL_SECONDS'] ?? DEFAULT_ACCESS_TTL_SECONDS),
  refreshTtlDays: Number(process.env['JWT_REFRESH_TTL_DAYS'] ?? DEFAULT_REFRESH_TTL_DAYS),
}));
