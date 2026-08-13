# Plan vs Actual API

Backend API for tracking monthly spending targets against actual spend, with variance reporting and locked accounting periods.

## Table of contents

- [What this is](#what-this-is)
- [Implementation status](#implementation-status)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Product rules](#product-rules)
  - [Money and months](#money-and-months)
  - [Variance](#variance)
  - [Missing actuals](#missing-actuals)
  - [Deletion](#deletion)
  - [Locking](#locking)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment variables](#environment-variables)
- [Database setup and seeding](#database-setup-and-seeding)
- [API documentation](#api-documentation)
- [Module breakdown](#module-breakdown)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Deployment](#deployment)
- [Assumptions and tradeoffs](#assumptions-and-tradeoffs)
- [What I would improve before production](#what-i-would-improve-before-production)

## What this is

A user sets a monthly spending target per category, logs what was actually spent, and reads a report comparing the two with variance in both absolute and percentage terms. Periods can be locked, after which plans and actuals inside them are read only and the API rejects edits.

The API is client agnostic. It speaks JSON over REST, carries sessions in the `Authorization` header rather than cookies, and makes no assumption about whether the caller is a web app, a mobile app, or a script. The web client lives in a separate repository and consumes `openapi.json` from this one.

## Implementation status

| Area | Status |
|---|---|
| Project scaffold, strict TypeScript, lint, CI | Done |
| Conventions, commit tooling, agent index | Done |
| Container image and compose stack | Done |
| PR template and agent skills | Done |
| Platform layer: config, logging, errors, docs, health | Done |
| Persistence: connection, tenant scoped repository, transactions | Done |
| Core domain: months, money, variance, pagination | Done |
| Auth and sessions | Done |
| Audit log | Not started |
| Categories | Not started |
| Period locks | Not started |
| Plans | Not started |
| Actuals | Not started |
| Reports and charts | Not started |
| CSV import | Not started |
| CSV export | Not started |
| Fiscal year | Not started |
| Seeders | Not started |
| Natural language query | Not started |
| Deployment | Not started |

## Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Node.js 22 LTS | Current LTS. Pinned in `.nvmrc` and `engines`. |
| Language | TypeScript 5.7, `strict: true` | No implicit `any`, no unchecked index access. See `.agents/conventions/code-standards.convention.md`. |
| Framework | NestJS 11 | Module boundaries, dependency injection, and first party support for validation, documentation, and health checks. |
| Database | MongoDB 8 with Mongoose 9 | Document model fits sparse plan and actual grids. Aggregation does the report in one round trip. |
| Tests | Jest 30, Supertest, mongodb-memory-server | Unit tests beside their source, end to end tests against a real in process replica set. |
| Docs | Swagger via `@nestjs/swagger` | Generated from the DTOs, exported to `openapi.json` for the web client. |

## Architecture

Three layers, enforced by folder boundaries:

- `src/common/` holds platform and domain primitives with no knowledge of any feature: configuration, logging, the error envelope, pagination, month arithmetic, money arithmetic, and the tenant scoped repository base.
- `src/modules/` holds one folder per feature. A module owns its schema, DTOs, service, controller, and tests, and declares which other modules it depends on in its own README.
- `src/seed/` holds the seeders, which are entry points rather than a module.

Two rules make the data safe rather than relying on discipline in each handler:

1. **Tenant scoping lives in the repository base.** Every query is scoped to the authenticated user there, so no controller can leak another user's rows by forgetting a filter.
2. **Lock enforcement lives in one service method.** Every mutating path calls it, so no route can bypass a locked period.

## Product rules

### Money and months

Money is stored as an integer count of minor units, never as a floating point number. A field named `planMinor` or `actualMinor` holds cents. One currency per user, defaulting to `USD`. Mixed currency accounts are out of scope.

A month is the string `YYYY-MM`, for example `2026-01`. This sorts lexicographically, so a date range is a plain `$gte` and `$lte` comparison on an indexed field, and no timezone can shift a record into the wrong month.

### Variance

```
variance     = actual - plan          (negative means under plan)
variance %   = (actual - plan) / plan * 100
```

When the plan is `0` the percentage is undefined. The API returns `null` for it, never `NaN` and never `Infinity`. Clients render `null` as `N/A`. The absolute variance is still returned, because it is well defined.

Percentages are rounded to two decimal places.

### Missing actuals

When a category has a plan for a month but nothing logged against it, the report's default is to treat the actual as `0`, which makes the variance the full negative of the plan. Pass `?missingActuals=null` to get `null` for the actual, the variance, and the percentage instead, so the client can render a dash.

Either way the response carries `hasActual`, so a real logged `0` is never confused with nothing logged.

### Deletion

Nothing is hard deleted. A `DELETE` sets `deletedAt` and the record stops appearing in reads; the row survives. From a client's point of view the record is gone, and the endpoint still answers `204`.

This is a financial system: a locked period has to keep resolving the category names it referenced, a report run last quarter has to reproduce, and a mistaken delete has to be recoverable without a database restore. A hard delete would destroy the audit trail that exists to protect against exactly that.

Two things are exempt, both ephemeral and neither owned by a user: refresh tokens and idempotency keys expire through a TTL index, and the seed script may reset a local database. The audit log is append only and is never modified at all.

### Locking

A month is the unit of locking. Locking a quarter creates three month locks, so both granularities work against one data shape and one query.

While a month is locked, its plans and actuals cannot be created, edited, or deleted. The API rejects the attempt with HTTP `423` and the code `PERIOD_LOCKED`; it does not rely on the client hiding a button. Moving an actual from one month to another checks both months, because moving spend out of a locked period is as much an edit as moving it in.

Locking is reversible. Unlocking is recorded in the audit log along with every other change to financial data.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22.13.0 or later | Pinned in `mise.toml`. `mise install` or `nvm use` both work; `.nvmrc` mirrors the same major version. |
| npm | 10.9.0 or later | Ships with Node 22. |
| Docker | Any recent version with Compose v2 | Only for the local database. Not needed if you point `MONGODB_URI` at Atlas. |

## Installation

```bash
git clone <repository-url>
cd plan-vs-actual-tracker
mise install                          # or: nvm use
npm install                           # also installs the git hooks via husky
git config commit.template .gitmessage
cp .env.example .env
```

Commit messages are checked by `commitlint` from a Husky `commit-msg` hook, so a message without a type and scope is rejected before it lands.

Fill in `.env`, then generate the two auth secrets:

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
```

Start the database and the API:

```bash
docker compose up -d
npm run start:dev
```

## Environment variables

| Name | Description | Example | Required |
|---|---|---|---|
| `NODE_ENV` | Runtime mode. Controls log format and error detail. | `development` | No, defaults to `development` |
| `PORT` | HTTP port. | `3000` | No, defaults to `3000` |
| `LOG_LEVEL` | Pino log level. | `debug` | No, defaults to `info` |
| `MONGODB_URI` | Connection string. The server must be a replica set member, because the CSV import writes in a transaction. | `mongodb://localhost:27017/plan_vs_actual?directConnection=true` | Yes |
| `JWT_ACCESS_SECRET` | Signing secret for access tokens. | Output of `openssl rand -base64 48` | Yes |
| `JWT_ACCESS_TTL` | Access token lifetime. | `15m` | No, defaults to `15m` |
| `JWT_REFRESH_SECRET` | Signing secret for refresh tokens. Must differ from the access secret. | Output of `openssl rand -base64 48` | Yes |
| `JWT_REFRESH_TTL` | Refresh token lifetime. | `7d` | No, defaults to `7d` |
| `CORS_ORIGINS` | Comma separated allowlist of browser origins. | `http://localhost:3001` | Yes in production |
| `ANTHROPIC_API_KEY` | Enables the natural language query endpoint. | `sk-ant-...` | No. The endpoint returns `503` without it. |

The application validates this set at boot and refuses to start on a missing or malformed required value, so a misconfiguration fails immediately instead of at the first request.

## Database setup and seeding

`docker compose up -d` starts MongoDB 8 as a single node replica set. A replica set is required because transactions are, and the healthcheck runs `rs.initiate()` on its first pass so there is no manual step.

Two seeders will be available:

| Command | What it inserts |
|---|---|
| `npm run seed:spec` | The exact sample data from the assignment, used by the end to end test that asserts the report's numbers. |
| `npm run seed:demo` | A catalogue of 40 categories and a demo user with 100 actuals across 12 months, mixing over plan, under plan, on plan, missing actuals, unplanned spend, and a locked quarter. |

Both are deterministic. Neither uses unseeded randomness, so test expectations stay stable.

## API documentation

Swagger UI is served at `/docs`, dark themed, with a case insensitive operation filter. The raw document is at `/docs-json`. Neither is mounted in production or test. The committed `openapi.json` is the contract the web client generates its types from, and it is regenerated whenever a DTO changes.

All routes are versioned under `/api/v1`. Every list endpoint paginates and returns `{ items, pagination: { limit, offset, total } }`. Every error shares one envelope:

```json
{
  "statusCode": 423,
  "code": "PERIOD_LOCKED",
  "message": "2026-01 is locked and cannot be edited.",
  "details": { "month": "2026-01" },
  "requestId": "0f9c1e2a-...",
  "path": "/api/v1/plans",
  "timestamp": "2026-01-15T10:04:11.212Z"
}
```

## Module breakdown

Each module folder carries its own README describing its purpose, its endpoints, and its dependencies.

| Module | Responsibility |
|---|---|
| `common/config` | Environment schema and boot time validation. |
| `common/logging` | Structured JSON logging with secret redaction. |
| `common/errors` | Error codes and the global exception filter that produces the envelope above. |
| `common/pagination` | Shared query and response shapes for list endpoints. |
| `common/money` | Minor unit helpers and the pure variance calculator. |
| `common/month` | Month parsing, validation, ranges, quarters, and fiscal years. |
| `common/database` | Mongoose connection, transaction helper, tenant scoped repository base. |
| `modules/auth` | Signup, login, refresh rotation, logout, session listing and revocation. |
| `modules/users` | User records, currency, and fiscal year start. |
| `modules/categories` | The system catalogue and user owned categories. |
| `modules/plans` | Monthly targets per category. |
| `modules/actuals` | Logged spend, and the filtered list that serves report drill down. |
| `modules/period-locks` | Locking, unlocking, and the single enforcement gate. |
| `modules/reports` | The aggregation, chart series, and CSV export. |
| `modules/imports` | CSV upload, validation, and idempotent transactional writes. |
| `modules/audit-log` | Append only record of every change to financial data. |
| `modules/nl-query` | Natural language question to a validated report filter. |
| `modules/health` | Liveness and readiness probes. |

## Testing

```bash
npm test           # unit tests
npm run test:cov   # unit tests with coverage
npm run test:e2e   # end to end tests against an in process MongoDB replica set
npm run lint       # eslint, no autofix
npm run typecheck  # tsc --noEmit
```

Unit tests sit beside their source as `{name}.spec.ts` and mock external dependencies, including Mongoose models. Each service and utility covers the happy path, validation failures, and edge cases such as an empty range, a plan of zero, an absent actual, and malformed CSV rows.

End to end tests run against a real MongoDB. A Jest `globalSetup` starts one in-memory replica set for the whole run and puts its connection string in the environment before any test file loads, which matters because the application validates its configuration at import time. They will cover the three behaviours the assignment names: the report's numbers match the stored sample data, a locked month rejects edits, and CSV import validates and replays idempotently.

## Project structure

```
.
├── AGENTS.md                    Index of the engineering standards
├── .agents/conventions/         The standards themselves, one file per topic
├── .agents/skills/              Repeatable workflows for PR docs, review, tests
├── .github/workflows/ci.yml     Format, lint, typecheck, test, build on every PR
├── .husky/commit-msg            Runs commitlint on every commit message
├── Dockerfile                   Three stage build, unprivileged runtime image
├── docker-compose.yml           Local MongoDB, plus the API behind a profile
├── openapi.json                 Generated API contract, consumed by the web client
├── src/
│   ├── main.ts                  Bootstrap
│   ├── app.module.ts            Root module, wiring only
│   ├── common/                  Platform and domain primitives, feature agnostic
│   ├── modules/                 One folder per feature, each with its own README
│   └── seed/                    Seed entry points
└── test/                        End to end specs and their Jest config
```

This is the layout the project targets. The [implementation status](#implementation-status) table above says which parts exist today.

## Deployment

The service ships as a container. `Dockerfile` is a three stage build: the first stage compiles TypeScript with the dev dependencies, the second resolves production dependencies from the same lockfile, and the runtime stage carries only `node_modules`, the compiled `dist/`, and `package.json`. It runs as the unprivileged `node` user, declares a TCP liveness check, and relies on Docker's init to forward `SIGTERM` for a clean shutdown.

```bash
docker build -t plan-vs-actual-api:local .    # image only
docker compose --profile app up -d --build    # database and API together
```

CI builds the same image on every pull request, so a broken Dockerfile fails before a deploy does.

A deployed environment takes its secrets from the platform's secret store, never from a committed file, and points `MONGODB_URI` at MongoDB Atlas over TLS.

## Assumptions and tradeoffs

| Assumption | Reasoning |
|---|---|
| One currency per user | The assignment's data has no currency column. Per record currency would need an exchange rate policy to make totals meaningful, which is a larger product decision than this exercise implies. |
| Negative actuals are allowed | Credit notes and refunds are real. Plan targets must be zero or positive. |
| No data is ever hard deleted | Deletes set `deletedAt` and reads exclude those rows. A category also has a separate `archivedAt`, because hiding it from a picker while keeping it selectable in history is a different state from deleting it. |
| System categories are shared, not copied | A catalogue row with no owner is readable by every user, so signup does not duplicate 40 rows per account. Users add their own categories on top and cannot edit the shared ones. |
| No queue or Redis | Nothing in this workload is long running. A CSV of a few thousand rows validates and writes well inside a request. Adding a broker would add a deployed service and a polling contract for no measured gain. The threshold that would change this is recorded below. |
| Audit records carry no IP or user agent | They are personal identifiers, and the logging convention forbids persisting them. The audit log answers what changed and by which account, which is what a financial trail needs. |

## What I would improve before production

- **Move the CSV import to a queue** once a single file crosses roughly 50,000 rows or the request approaches the platform's timeout, and return a job id the client polls. The import already writes in one transaction, so the change is where it runs, not how it is written.
- **Move the report cache to Redis.** The in memory cache is correct but per instance, so it stops helping the moment the service runs more than one replica.
- **Push variance into the aggregation** as an `$addFields` stage if reports grow beyond a page of rows per user, so the database does the arithmetic instead of the application.
- **Add rate limiting per user rather than per IP** for the report and import endpoints, since an authenticated caller is the meaningful unit of abuse.
- **Add a data retention policy for the audit log**, with a documented retention period and an archive target, rather than growing it without bound.
- **Alarm on error rate and p95 latency** rather than relying on the health endpoint, and ship logs to a searchable store.
