import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { RequestMethod } from '@nestjs/common';
import { Params } from 'nestjs-pino';
import type { Level } from 'pino';
import { IAppConfig } from '@common/config';
import { NodeEnvEnum } from '@common/enums';

/**
 * Fields scrubbed from every log line.
 *
 * @remarks
 * Redaction is configured once, at the logger, rather than at each call site.
 * A new call site therefore cannot leak a credential by forgetting to strip it.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.apiKey',
  'req.body.password',
  'req.body.token',
  'req.body.refreshToken',
];

/** Paths that are too noisy to log on every hit. */
const UNLOGGED_PATHS = ['/api/v1/health', '/api/v1/health/ready', '/docs', '/docs-json'];

/**
 * Reports whether the pretty printing transport is installed.
 *
 * @remarks
 * `pino-pretty` is a development dependency, so it is absent from the production
 * image. Selecting the transport on environment alone would crash the process at
 * boot with "unable to determine transport target" whenever a production build
 * runs with `NODE_ENV=development`, which is exactly what a containerised local
 * run does. Checking that it resolves degrades to JSON logs instead.
 *
 * @returns True when `pino-pretty` can be loaded.
 */
const isPrettyPrintAvailable = (): boolean => {
  try {
    require.resolve('pino-pretty');

    return true;
  } catch {
    return false;
  }
};

/**
 * Builds the pino options used by the application logger.
 *
 * @remarks
 * Three behaviours matter here. Every request gets a `requestId`, echoed in the
 * `x-request-id` response header so a user's report of a failure is traceable to
 * its log lines. Credentials are redacted centrally. A response the caller
 * caused, such as a validation failure, logs at `info` rather than `error`,
 * because error rate is an alerting signal and filling it with ordinary
 * rejections makes it useless.
 *
 * Pretty printing is development only. Deployed environments emit one JSON
 * object per line for a log aggregator to parse.
 *
 * @param appConfig - Validated application configuration.
 * @returns Options for `LoggerModule.forRootAsync`.
 */
export const buildLoggerOptions = (appConfig: IAppConfig): Params => ({
  // Express 5 rejects the bare `*` this middleware registers by default, so Nest
  // logs a legacy route conversion warning on every boot. Registering the named
  // wildcard keeps the same coverage without the warning.
  //
  // It must be `*splat`. The `{*path}` form that Nest names in its own warning
  // message matches nothing here, and fails silently: the middleware stops
  // running, so requests are no longer logged and no error is raised.
  forRoutes: [{ path: '*splat', method: RequestMethod.ALL }],

  pinoHttp: {
    level: appConfig.logLevel,

    genReqId: (req: IncomingMessage, res: ServerResponse): string => {
      const forwarded = req.headers['x-request-id'];
      const requestId = typeof forwarded === 'string' && forwarded.length > 0 ? forwarded : randomUUID();

      res.setHeader('x-request-id', requestId);

      return requestId;
    },

    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },

    autoLogging: {
      ignore: (req: IncomingMessage): boolean => UNLOGGED_PATHS.includes(req.url ?? ''),
    },

    customLogLevel: (_req: IncomingMessage, res: ServerResponse, error?: Error): Level => {
      // A failure the service owns is an error. A rejection the caller caused is
      // not: error rate is an alerting signal, and filling it with ordinary
      // validation failures makes it useless.
      if (error !== undefined || res.statusCode >= 500) {
        return 'error';
      }

      return 'info';
    },

    transport:
      appConfig.nodeEnv === NodeEnvEnum.DEVELOPMENT && isPrettyPrintAvailable()
        ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' } }
        : undefined,
  },
});
