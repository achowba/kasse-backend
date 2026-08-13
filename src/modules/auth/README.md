# modules/auth

Sessions: establishing them, renewing them, and ending them. Also the guard that protects every other route.

## The session model

Two tokens, deliberately different things.

**The access token** is a short lived RS256 JWT. Every request verifies it with the public key, in process, without touching the database, which keeps the hot path cheap. The cost is that it cannot be revoked before it expires, which is why it is short lived.

**The refresh token** is opaque random data with no claims and no signature. It is long lived, so it must be revocable, and revocation needs a stored record anyway.

## Why asymmetric signing

The private key signs and never leaves this service. The public key only verifies. Any other service, or a client-side gateway, can therefore confirm a token is genuine while holding nothing capable of minting one. A shared HS256 secret would give every verifier full issuing power.

Both keys are supplied base64 encoded, because a PEM contains newlines and an environment variable is one line. They are decoded and inspected at boot: a value that does not decode to a PEM of the right kind fails the boot rather than surfacing as an unhelpful signing error at the first login.

## Rotation and reuse detection

Every refresh rotates. The presented token is revoked and a new one is issued in the same family, so a refresh token works exactly once. The revoke and the issue run in one transaction, so a failure between them cannot leave a session with no usable refresh token.

Presenting an already rotated token means the chain leaked. The response is to revoke the entire family, which signs out both the legitimate user and whoever stole the token. That is deliberate: a noisy failure the user notices is better than a quiet ongoing compromise.

## How the hashing choices differ, and why

| Secret | Hash | Reason |
|---|---|---|
| Password | Argon2id, 19 MiB, t=2, p=1 | Low entropy input. Memory hardness is what makes a stolen hash expensive to attack. |
| Refresh token | SHA-256 | 256 bits of randomness. There is no dictionary to attack, and the lookup at refresh time needs the hash to be deterministic. Argon2 here would be slow for no gain. |

## Things that are quiet on purpose

- **Login gives one answer.** A wrong password and an unknown address return the same status and the same message, and the unknown path still runs a hash so it takes comparable time. Returning early would turn the endpoint into an address oracle.
- **Signup is the exception**, and says when an address is taken, because a registration form cannot be usable otherwise.
- **Logout is idempotent** and says nothing about whether a token existed or belonged to someone else.
- **A session id that is not yours answers 404**, not 403.

## Authentication is on by default

`JwtAuthGuard` is registered globally, so a newly added route is protected without anyone remembering to protect it. A route opts out with `@Public`, which is a visible, greppable decision. The opposite arrangement fails silently the first time someone forgets.

## Sessions carry no device label

A session is identified by when it started and when it was last used. Naming the device means storing the user agent, and this service does not persist identifiers it does not need. Timestamps are enough to recognise a session you do not expect.

## How it relates to the rest of the project

Depends on `modules/users` to create and read accounts. Every other feature module depends on this one indirectly, through the global guard and the `@CurrentUser` decorator in `@common/auth`.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/auth/signup` | Public | Register an account and start a session. |
| `POST` | `/api/v1/auth/login` | Public | Exchange credentials for a token pair. |
| `POST` | `/api/v1/auth/refresh` | Public | Exchange a refresh token for a new pair. The token is the credential. |
| `POST` | `/api/v1/auth/logout` | Bearer | Revoke one refresh token. |
| `GET` | `/api/v1/auth/sessions` | Bearer | List active sessions. |
| `DELETE` | `/api/v1/auth/sessions` | Bearer | End every session, including the caller's. |
| `DELETE` | `/api/v1/auth/sessions/:sessionId` | Bearer | End one session. |

The credential routes are rate limited harder than the rest of the API, because they are the credential stuffing surface.

## Dependencies on other modules

`@modules/users` for accounts. `@common/auth` for the request-level primitives. `@common/config` for the keys and lifetimes. `@common/database` for the tenant scoped repository and the transaction helper. `@common/pipes` for identifier parsing.
