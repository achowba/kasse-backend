# common/logging

Structured logging, with redaction configured centrally.

## What it does

Builds the pino options used by `LoggerModule`. Three behaviours matter:

- **Request correlation.** Every request gets an id, taken from an inbound `x-request-id` when present and generated otherwise. It is echoed in the response header, attached to every log line for that request, and included in the error envelope, so a user's report of a failure at a given time is traceable to its logs.
- **Redaction at the logger.** Authorization headers, cookies, and any field named like a credential are scrubbed centrally, at any depth. A new call site therefore cannot leak a token by forgetting to strip it. See below: this used to be less true than it read.
- **Level by cause.** A response the caller caused logs at `info`; a failure the service owns logs at `error`. Error rate stays a meaningful alerting signal.

Output is one JSON object per line. Pretty printing is development only.

## Redaction happens twice, on purpose

Two mechanisms, and neither replaces the other.

**pino's `redact` paths** handle the request and response, whose shape is known: `req.headers.authorization`, `res.headers["set-cookie"]`, and the credential fields of a request body. Exact and cheap.

**A recursive walk** in `logger.format.ts`, wired as pino's `formatters.log`, handles everything else. It replaces the value of any key in `REDACTED_LOG_KEYS` wherever it appears, at any depth, matching case insensitively.

### Why the second one had to exist

The path patterns reach exactly as far as they are written. `*.token` matches **one** level, so this survived redaction:

```ts
logger.log({ user: { profile: { session: { token } } } }, 'signed in');
```

Anything nested deeper than a pattern anticipated came through in the clear, which means the "no secret in a log" invariant held only for shapes somebody had already thought of. That is not an invariant, it is a habit. The walk makes it structural. A test asserts exactly that case.

### What the walk is careful about

| Case | Behaviour | Why |
|---|---|---|
| `Date`, `ObjectId`, `Error`, `Buffer` | Returned untouched | Rebuilt key by key, a `Date` becomes `{}` and an `ObjectId` becomes an unreadable internal shape. The check is on the prototype, not `typeof`. |
| A cycle | Replaced with `[CIRCULAR]` | A cyclic context would otherwise throw inside the serialiser, and a log line would become the thing that fails the request. |
| Still nested at depth 6 | Replaced with `[TRUNCATED]` | **Replaced**, not returned. Returning the subtree would let an unredacted, possibly cyclic branch escape the walk entirely. |
| The same object twice as siblings | Redacted twice | `seen` is the current path, not everything ever visited, so entries are removed on the way back up. Treating a repeat as circular would silently drop real context. |
| The caller's own object | Never mutated | The caller may still be using what it logged. Rewriting their data as a side effect of logging it would be a nasty bug to chase. |

The key list stays narrow deliberately. Over-redacting hides the context that makes a log line worth having, and a log full of `[REDACTED]` is one nobody reads.

## How it relates to the rest of the project

`AppModule` configures `LoggerModule` from these options. `main.ts` installs the resulting logger and flushes the buffered boot lines through it, so startup is recorded in the same format as everything after it.

The middleware registers itself for `*splat`, the Express 5 named wildcard. The `{*path}` form fails silently and stops the middleware running, which is noted in the source.

## Endpoints

None.

## Dependencies on other modules

`@common/config` for the log level and environment, `@common/enums` for `NodeEnvEnum`.
