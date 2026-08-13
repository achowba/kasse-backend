# Logging convention

## Format

- Structured JSON through `pino`. One event per line, machine parseable.
- No `console.log`. Use the injected logger so output carries context and honours the configured level.
- Every log line inside a request carries the `requestId`, the route, and the authenticated user id when there is one.
- A message is a short fixed string. Variable data goes in fields, not interpolated into the message, so lines group correctly in a log search.

Write `log.info({ month, categoryId }, 'plan updated')`, not `log.info(\`plan updated for ${month}\`)`.

## Levels

| Level | Use |
|---|---|
| `error` | The request failed for a reason the service owns. Something needs looking at. |
| `warn` | Degraded but handled. A retry succeeded, an optional dependency is absent. |
| `info` | A state change worth seeing in production: a lock applied, an import completed, a session revoked. |
| `debug` | Detail for local work and incident digging. Off in production by default. |

A rejected request caused by the caller is `info`, not `error`. Error rate is an alerting signal, and filling it with ordinary validation failures makes it useless.

## Redaction

These are redacted at the logger, not at each call site, so a new call site cannot leak them:

- `authorization` and `cookie` headers.
- Any field named `password`, `token`, `refreshToken`, `accessToken`, `secret`, or `apiKey`.
- Request bodies on the auth routes.

## Never log

- A credential, a token, or a password hash.
- A full request body that could hold one.
- An IP address or a user agent as a stored personal identifier. Transient request logging is one thing, persisting them into a durable record is another, and the audit trail does not do it.
- Third party API keys, including in an error from a failed call.

## Log before throw

Log the failure with its context at the point you know the most about it, then throw. A caller further up has less information and may not log at all.
