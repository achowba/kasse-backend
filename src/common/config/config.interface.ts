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
