import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { hostname } from 'node:os';
import { RequestMethod } from '@nestjs/common';
import { Params } from 'nestjs-pino';
import type { Level } from 'pino';
import { IAppConfig } from '@common/config';
import { NodeEnvEnum } from '@common/enums';
import { redactEntry } from './logger.format';
import { REDACTED_PATHS, REDACTED_PLACEHOLDER, REQUEST_LOG_CONTEXT, UNLOGGED_PATHS } from './logging.constants';

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
  //
  // Nest applies the global prefix to a middleware path, so this covers `/api`
  // and nothing else. Everything outside it, `/`, `/favicon.ico`, `/docs`, and
  // any typo a client sends, was reaching the exception filter with no request
  // log and an empty request id, which made a 404 both invisible and
  // unattributable. `bootstrapNestServer` registers the same middleware at the
  // Express level, before routing, so those requests are logged too.
  forRoutes: [{ path: '*splat', method: RequestMethod.ALL }],

  pinoHttp: {
    level: appConfig.logLevel,

    // On every line, including the framework's own, because the first question
    // asked of a pasted log line is which environment produced it. Setting `base`
    // rather than adding it per call site means nothing can forget it.
    //
    // `pid` and `hostname` are restated because `base` replaces pino's defaults
    // rather than extending them, and dropping them would lose the two fields
    // that identify which process wrote a line when several are running.
    base: { pid: process.pid, hostname: hostname(), environment: appConfig.nodeEnv },

    genReqId: (req: IncomingMessage, res: ServerResponse): string => {
      const forwarded = req.headers['x-request-id'];
      const requestId = typeof forwarded === 'string' && forwarded.length > 0 ? forwarded : randomUUID();

      res.setHeader('x-request-id', requestId);

      return requestId;
    },

    // Two mechanisms, and neither replaces the other. `redact` is exact and cheap
    // on the known request and response shape. `formatters.log` runs the
    // recursive walk over everything else, which is where a secret nested deeper
    // than a path pattern anticipated would otherwise survive.
    redact: { paths: REDACTED_PATHS, censor: REDACTED_PLACEHOLDER },

    formatters: {
      log: redactEntry,
    },

    // Stamped on every request line so it reads like the rest of the log. Without
    // it the framework's own lines carry a context and the request lines do not,
    // and a reader filtering by context silently loses the requests.
    customProps: (): Record<string, string> => ({ context: REQUEST_LOG_CONTEXT }),

    customSuccessMessage: (req: IncomingMessage, res: ServerResponse): string =>
      `${req.method ?? 'GET'} ${req.url ?? ''} ${res.statusCode}`,

    customErrorMessage: (req: IncomingMessage, res: ServerResponse): string =>
      `${req.method ?? 'GET'} ${req.url ?? ''} ${res.statusCode}`,

    autoLogging: {
      // Matched on the path alone, so a query string does not smuggle a health
      // probe back into the log.
      ignore: (req: IncomingMessage): boolean => UNLOGGED_PATHS.includes((req.url ?? '').split('?')[0] ?? ''),
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
