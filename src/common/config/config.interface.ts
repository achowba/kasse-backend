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
 */
export interface IAppConfig {
  nodeEnv: NodeEnvEnum;
  port: number;
  version: string;
  logLevel: string;
  allowedOrigins: string[];
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
