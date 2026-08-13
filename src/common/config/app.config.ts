import { registerAs } from '@nestjs/config';
import { API_DOC_VERSION } from '@common/constants';
import { NodeEnvEnum } from '@common/enums';
import { DEFAULT_LOG_LEVEL, DEFAULT_PORT, DEFAULT_THROTTLE_LIMIT, DEFAULT_THROTTLE_TTL_MS } from './config.constants';
import { IAppConfig } from './config.interface';

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
  throttleTtlMs: Number(process.env['THROTTLE_TTL_MS'] ?? DEFAULT_THROTTLE_TTL_MS),
  throttleLimit: Number(process.env['THROTTLE_LIMIT'] ?? DEFAULT_THROTTLE_LIMIT),
}));
