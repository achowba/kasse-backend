# common/logging

Structured logging, with redaction configured centrally.

## What it does

Builds the pino options used by `LoggerModule`. Three behaviours matter:

- **Request correlation.** Every request gets an id, taken from an inbound `x-request-id` when present and generated otherwise. It is echoed in the response header, attached to every log line for that request, and included in the error envelope, so a user's report of a failure at a given time is traceable to its logs.
- **Redaction at the logger.** Authorization headers, cookies, and any field named like a credential are scrubbed centrally, at any depth. A new call site therefore cannot leak a token by forgetting to strip it. See below: this used to be less true than it read.
- **Level by cause.** A response the caller caused logs at `info`; a failure the service owns logs at `error`. Error rate stays a meaningful alerting signal.

Output is one JSON object per line. Pretty printing is development only.

## The request body is logged, scrubbed

`pino-http` logs no request body. It emits the method, URL, query, route params, headers, and peer address, so a payload was invisible and the `req.body.*` entries in `REDACTED_PATHS` matched nothing at all. A 401 could not be told from a wrong password without guessing.

`buildRequestProps` adds it as `requestBody`, with every credential replaced. A request carrying no body adds nothing, so a `GET` line is unchanged.

It is wired as `customProps` rather than as a `req` serialiser, and that is forced rather than chosen. **pino serialises a child logger's bindings when the child is created**, which `pino-http` does on entering the middleware. The body parser has not run at that point, so a `req` serialiser sees no body however it is written. `customProps` is evaluated when the line is written, on response finish, which is the only point at which the body exists.

Every body is logged, in every environment. That is a deliberate trade for debuggability, and it has a cost worth restating: bodies here are small and bounded by their DTOs, but an endpoint accepting a large payload would want a size guard, and a body can carry personal data that a retention policy then has to account for.

## One request, one line

The request logger is registered twice over, and only one of those registrations may build a `pino-http` instance.

Nest applies the global prefix to a middleware path, so `LoggerModule`'s own registration only ever covered `/api`. Requests to `/`, `/favicon.ico`, `/docs`, and every typo reached the exception filter with no request line and an empty request id, so a 404 was both invisible and unattributable. `bootstrapNestServer` therefore registers `pino-http` at the Express level, before routing.

`LoggerModule` is then configured with `useExisting`, which leaves it contributing only the middleware that binds the request logger into async local storage. That binding is not optional: it is what gives a line written inside a handler the same request id as the request line.

Without `useExisting` both instances log every `/api` request, because **`pino-http` sets no marker for a request it has already handled**. The two lines are near identical, and the only tell is that the second has been through routing and so carries `params`.

## Every line names the account

A log line about a request carries the account it belongs to, in one shape:

```json
"user": { "id": "6a7e25c9875401477a4b86c4", "email": "demo@kasse.app" }
```

One shape, everywhere, because the point of it is filtering. A line saying `userId` and another saying `user.id` cannot be selected by the same query, so a search for one account silently returns half its activity, which is worse than returning none: it looks like an answer. `logUser` builds it, and every call site uses it rather than assembling the fields by hand.

The address rides in the access token rather than being looked up. Loading the account on every request to name it in a log would add a database read to the hot path, which is the thing stateless verification exists to avoid. It is **attribution, never authorisation**: nothing is decided from it, every query is scoped by the account id, and a token issued before an address changed carries the old one until it expires.

`buildRequestProps` reads the request structurally rather than importing the auth types. This module is a leaf that everything logging depends on, and giving it an import from a feature module for one property name is how a cycle starts.

An unauthenticated request carries no `user` at all. A public route, a missing token, and a rejected one all land there, and all three are still logged.

The identifier is narrowed to an `ObjectId` or a string rather than stringified loosely. Anything else reaching `String()` logs `[object Object]`, which is worse than logging nothing: it looks like an identifier, it groups every account under one value, and it would be believed.

## Redaction happens twice, on purpose

Two mechanisms, and neither replaces the other.

**pino's `redact` paths** handle the request and response, whose shape is known: `req.headers.authorization`, `res.headers["set-cookie"]`, and the credential fields of a request body. Exact and cheap.

**A recursive walk** in `logger.format.ts`, wired as pino's `formatters.log`, handles everything else. It replaces the value of any key in `REDACTED_LOG_KEYS` wherever it appears, at any depth, matching case insensitively.

The body goes through the walk before it ever reaches the entry, in `buildRequestProps`. `formatters.log` would reach it anyway, since it sits at the top level of the entry as a plain object, but scrubbing it where it is introduced keeps the guarantee inside the function that creates the risk rather than resting on a walk configured elsewhere.

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
