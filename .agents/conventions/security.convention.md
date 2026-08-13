# Security convention

## Input

- Validate at the edge. A DTO with `class-validator` decorators guards every route, and the global pipe whitelists properties, strips unknown ones, and rejects a body that carries them.
- Nothing unvalidated reaches a service. A service may assume its input is well formed because the boundary guaranteed it.
- Bound every input that touches a query: a page size cap, a maximum upload size, a maximum row count, a maximum string length.

## Queries

- Query with Mongoose's typed builders and pass user input as values, never as a fragment of a query object.
- Never pass a client supplied object straight into a filter. A field like `{ $ne: null }` arriving as a value is how an authorization filter gets bypassed.
- No `$where`, no `mapReduce`, no `eval`. They accept expressions and there is no reason to need them here.

## Authorization

- Scope every query to the authenticated user in the repository layer. Per handler filtering is one forgotten line away from exposing another account's data.
- A record the caller does not own is a `404`. Do not confirm it exists.
- The shared category catalogue is readable by all and writable by none.

## Credentials

- Passwords are hashed with Argon2id. Never a fast hash, never an unsalted one.
- An access token is short lived. A refresh token is stored only as a hash, rotates on every use, and can be revoked.
- A password, a token, or a hash never appears in a log, a response, or an error.

## Secrets

- Secrets come from the environment, validated at boot. The service refuses to start with a missing or malformed one, so a misconfiguration fails immediately rather than at the first request.
- `.env` is never committed. `.env.example` lists names and shapes only.
- The access and refresh signing secrets must differ. A single secret means a stolen refresh token is also an access token.

## Transport and headers

- HTTPS in every deployed environment. No plaintext database connection off localhost.
- `helmet` sets the security headers.
- CORS is an explicit origin allowlist from configuration. Never a reflected origin, never `*` alongside credentials.

## Rate limits

- Auth routes are rate limited harder than the rest. Login, signup, and refresh are the credential stuffing surface.
- Import and report routes are limited too, because both are expensive per call.

## Auditability

- Every change to financial data writes an append only audit record. A finance system has to be able to answer what changed, when, and by which account.

## Dependencies

- Justify a new dependency, check it is actively maintained, and pin it through the lockfile.
- `npm audit` runs in CI. A known vulnerability in a production dependency blocks a release.
