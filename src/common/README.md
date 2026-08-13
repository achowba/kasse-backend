# common

Platform and domain primitives, knowing nothing about any feature.

## Where this sits

Kasse tracks monthly spending targets against what was actually spent, reports the variance, and freezes a period once it is closed.

`src/modules/` holds the features. `src/common/` holds what they are built from. The rule is one directional: **`common` never imports from `modules`**. A primitive that knew about a feature would stop being a primitive, and `npm run lint:circular` fails the build if that direction is ever reversed.

## What is here, and why each exists

| Folder | Holds | The reason it is a primitive |
|---|---|---|
| [`money`](money/README.md) | Minor units, amount parsing, `calculateVariance` | Variance is the piece the whole product is judged on. As a pure function over two integers it is exhaustively testable without a database. |
| [`month`](month/README.md) | `YYYY-MM` parsing, ranges, quarters, fiscal years | A budget month has no time and no timezone. Keeping it a string is what stops a timezone moving December spend into January. |
| [`database`](database/README.md) | `BaseTenantRepository`, soft delete, transactions | Two invariants that fail silently: every query scoped to the account, every read excluding deleted rows. Enforced in one place rather than remembered per handler. |
| [`errors`](errors/README.md) | Error codes, `AppException`, the global filter | One error envelope for every failure, so a client branches on a stable code rather than parsing a message. |
| [`logging`](logging/README.md) | pino options, recursive redaction | "No secret in a log" has to be structural. Path patterns reach only as far as they are written. |
| [`config`](config/README.md) | Env validation, typed configuration | A missing variable stops the process at boot rather than surfacing at the first request that needs it. |
| [`auth`](auth/README.md) | The authenticated user shape and its decorators | Feature modules read the caller without knowing how a token was verified. |
| [`cache`](cache/README.md) | The per account data version | Report invalidation, placed here so writers and the reader both depend downward instead of on each other. |
| [`throttling`](throttling/README.md) | Per account rate limiting | An address is the wrong unit for an authenticated API, in both directions. |
| [`pagination`](pagination/README.md) | The shared list envelope | Every list endpoint answers the same shape, so a client writes one pager. |
| [`pipes`](pipes/README.md) | `ParseObjectIdPipe` | A malformed id is a `400`, not a `500`. |
| [`request-context`](request-context/README.md) | The `@RequestId` decorator | Correlates a response, its logs, and its audit entry. |
| [`constants`](constants/README.md) | Values crossing feature boundaries | |
| [`enums`](enums/README.md) | `NodeEnvEnum`, `ApiVersionEnum` | |

## The pattern every folder follows

Each carries a `README.md`, a `*.constants.ts` for its module level values, and its tests beside the source as `{name}.spec.ts`. Nothing exports a default, so imports stay greppable and renames stay honest.

## Convert at the edge, trust inside

The strongest idea running through this folder. Money becomes an integer count of minor units at the boundary. A month becomes a validated `YYYY-MM` string at the boundary. An identifier becomes an `ObjectId` at the boundary.

The payoff is that a service reading those three types contains no defensive code at all, and a whole category of bug simply cannot be expressed further in.

## Dependencies

`@common/*` may depend on other `@common/*` folders and on framework packages. It never depends on `@modules/*`.
