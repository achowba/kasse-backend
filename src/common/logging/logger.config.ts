import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { hostname } from 'node:os';
import { RequestMethod } from '@nestjs/common';
import { Params } from 'nestjs-pino';
import type { Level } from 'pino';
import { IAppConfig } from '@common/config';
import { NodeEnvEnum } from '@common/enums';
import { buildRequestProps, redactEntry } from './logger.format';
import { REDACTED_PATHS, REDACTED_PLACEHOLDER, UNLOGGED_PATHS } from './logging.constants';

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
  // `bootstrapNestServer` registers pino-http at the Express level, because Nest
  // applies the global prefix to a middleware path: this module's registration
  // only ever covered `/api`, so `/`, `/favicon.ico`, `/docs`, and any typo a
  // client sends reached the exception filter with no request log and an empty
  // request id, which made a 404 both invisible and unattributable.
  //
  // `useExisting` stops this module building a second pino-http on top of that
  // one. Without it every `/api` request is logged twice, because pino-http has
  // no guard against running twice: version 11 sets no "already handled" marker,
  // so both instances log independently and the only visible difference is that
  // the second has been through routing and carries `params`.
  //
  // What remains is the middleware that binds the request logger into async
  // local storage. That is not optional. It is what gives a log line written
  // inside a handler the same request id as the request line itself.
  useExisting: true,

  // Express 5 rejects the bare `*` this middleware registers by default, so Nest
  // logs a legacy route conversion warning on every boot. Registering the named
  // wildcard keeps the same coverage without the warning.
  //
  // It must be `*splat`. The `{*path}` form that Nest names in its own warning
  // message matches nothing here, and fails silently: the middleware stops
  // running, so the request id is never bound and no error is raised.
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

    // Two jobs. It stamps the request context, without which the framework's own
    // lines carry one and the request lines do not, so a reader filtering by
    // context silently loses the requests. And it adds the parsed request body,
    // scrubbed.
    //
    // It has to be `customProps` rather than a `req` serialiser. pino serialises
    // a child logger's bindings when the child is created, which pino-http does
    // on entering the middleware, before any body parser has run. `customProps`
    // is evaluated when the line is written, on response finish, which is the
    // only point where the body exists.
    customProps: buildRequestProps,

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
