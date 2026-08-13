# common/enums

Enumerations shared across features.

## Where this sits

Kasse tracks monthly spending targets against what was actually spent. This folder holds the two enumerations that are not owned by any one feature, because behaviour in several places keys off them.

Anything belonging to a single feature stays in that feature's `*.enums.ts`: `ExpenseSourceEnum` lives in expenses, `AuditActionEnum` in the audit log, `MissingSpendPolicyEnum` in `@common/money` beside the function that applies it.

## `NodeEnvEnum`

`development`, `test`, `staging`, `production`.

Four things branch on it, and each is a deliberate difference rather than an accident:

| Behaviour | Rule |
|---|---|
| Documentation UI | Mounted everywhere **except** production. A single exclusion, not an allowlist, so a new environment name gets the docs rather than silently losing them. |
| Log format | Pretty printed only in development. Everywhere else emits one JSON object per line for an aggregator to parse. |
| CORS | Permissive in development and test, where a client's port changes constantly. Strict allowlist in staging and production. |
| Pretty printer availability | The production image has no dev dependencies, so the logger checks that `pino-pretty` resolves before asking for it. A container running the production image with `NODE_ENV=development` would otherwise crash loop. |

## `ApiVersionEnum`

Names the versions exposed through URI versioning, producing `/api/v1/...`.

It holds the number alone, `'1'`, because Nest adds the `v` prefix itself. Putting the `v` in the enum would double it on every route. That detail is worth stating: the startup banner got it wrong the first time and printed an address that did not exist.

A breaking change to a response adds a member. It never mutates an existing version in place, because a published contract that changes meaning is worse than one that grows.

## How it relates to the rest of the project

`@common/config` types the validated environment against `NodeEnvEnum`, so an unrecognised value fails at boot instead of falling through to production behaviour by accident. Controllers declare their version with `ApiVersionEnum`.

## Dependencies on other modules

None. This folder is a leaf on purpose: everything may depend on it, and it depends on nothing.
