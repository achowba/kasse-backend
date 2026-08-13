import { NodeEnvEnum } from '@common/enums';

/**
 * Application configuration, resolved once at boot from validated environment
 * variables.
 *
 * @remarks
 * Everything here has already passed validation, so a consumer can treat each
 * field as present and well formed. Read it through
 * `ConfigService.getOrThrow<IAppConfig>('app')` rather than touching
 * `process.env` directly, which is unvalidated and untyped.
 *
 * @property nodeEnv - The environment the process believes it is running in.
 * @property port - TCP port the HTTP server binds to.
 * @property version - Version reported in the OpenAPI document.
 * @property logLevel - Minimum severity written to the log.
 * @property allowedOrigins - Browser origins allowed by CORS. Empty means none.
 * @property throttleTtlMs - Rate limit window for ordinary routes, in milliseconds.
 * @property anthropicApiKey - Key for the natural language endpoint, or null when it is not configured.
 * @property throttleLimit - Requests allowed per window per caller on ordinary routes.
 */
export interface IAppConfig {
  nodeEnv: NodeEnvEnum;
  port: number;
  publicUrl: string | null;
  version: string;
  logLevel: string;
  allowedOrigins: string[];
  throttleTtlMs: number;
  throttleLimit: number;
  anthropicApiKey: string | null;
}

/**
 * Database configuration.
 *
 * @remarks
 * Kept in its own namespace so the persistence layer depends on the database
 * settings alone, rather than on everything the application happens to know.
 *
 * @property uri - MongoDB connection string. The server must be a replica set
 *   member, because writes that span documents run in a transaction.
 * @property autoIndex - Whether Mongoose builds declared indexes at startup.
 */
export interface IDatabaseConfig {
  uri: string;
  autoIndex: boolean;
}

/**
 * Authentication configuration.
 *
 * @remarks
 * Access tokens are signed asymmetrically. The private key signs and never
 * leaves this service; the public key only verifies, so another service can
 * validate a token without holding anything capable of minting one. A shared
 * symmetric secret would give every verifier full issuing power.
 *
 * Refresh tokens are not JWTs and have no signing key. They are opaque random
 * bytes, stored only as a hash, so there is nothing here for them.
 *
 * @property privateKey - PEM encoded signing key.
 * @property publicKey - PEM encoded verification key.
 * @property algorithm - JWT signing algorithm. RS256, matching the key pair.
 * @property accessTtlSeconds - Access token lifetime in seconds.
 * @property refreshTtlDays - Refresh token lifetime in days.
 */
export interface IAuthConfig {
  privateKey: string;
  publicKey: string;
  issuer: string;
  algorithm: 'RS256';
  accessTtlSeconds: number;
  refreshTtlDays: number;
}
