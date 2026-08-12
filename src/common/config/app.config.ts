import { registerAs } from '@nestjs/config';
import { API_DOC_VERSION } from '@common/constants';
import { NodeEnvEnum } from '@common/enums';
import { IAppConfig } from './config.interface';

/** Port used when `PORT` is not set. */
const DEFAULT_PORT = 3000;

/** Log level used when `LOG_LEVEL` is not set. */
const DEFAULT_LOG_LEVEL = 'info';

/**
 * Splits a comma separated origin list into an allowlist.
 *
 * @param value - The raw `CORS_ORIGINS` value, possibly undefined.
 * @returns The origins, trimmed, with empty entries dropped.
 */
const parseOrigins = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

/**
 * Builds the `app` configuration namespace from the validated environment.
 *
 * @remarks
 * This is the only place that reads `process.env` for application settings.
 * Everything downstream reads the typed {@link IAppConfig} through
 * `ConfigService`, so there is one definition of each default.
 *
 * @returns The resolved application configuration.
 */
export const appConfig = registerAs('app', (): IAppConfig => ({
  nodeEnv: (process.env['NODE_ENV'] as NodeEnvEnum | undefined) ?? NodeEnvEnum.DEVELOPMENT,
  port: Number(process.env['PORT'] ?? DEFAULT_PORT),
  version: API_DOC_VERSION,
  logLevel: process.env['LOG_LEVEL'] ?? DEFAULT_LOG_LEVEL,
  allowedOrigins: parseOrigins(process.env['CORS_ORIGINS']),
}));
