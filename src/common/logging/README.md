# common/logging

Structured logging, with redaction configured centrally.

## What it does

Builds the pino options used by `LoggerModule`. Three behaviours matter:

- **Request correlation.** Every request gets an id, taken from an inbound `x-request-id` when present and generated otherwise. It is echoed in the response header, attached to every log line for that request, and included in the error envelope, so a user's report of a failure at a given time is traceable to its logs.
- **Redaction at the logger.** Authorization headers, cookies, and any field named like a credential are scrubbed centrally. A new call site therefore cannot leak a token by forgetting to strip it.
- **Level by cause.** A response the caller caused logs at `info`; a failure the service owns logs at `error`. Error rate stays a meaningful alerting signal.

Output is one JSON object per line. Pretty printing is development only.

## How it relates to the rest of the project

`AppModule` configures `LoggerModule` from these options. `main.ts` installs the resulting logger and flushes the buffered boot lines through it, so startup is recorded in the same format as everything after it.

The middleware registers itself for `*splat`, the Express 5 named wildcard. The `{*path}` form fails silently and stops the middleware running, which is noted in the source.

## Endpoints

None.

## Dependencies on other modules

`@common/config` for the log level and environment, `@common/enums` for `NodeEnvEnum`.
