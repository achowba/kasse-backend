# Kasse

Set a monthly spending target per category, log what you actually spend, and read the difference. Close a period and the numbers stop moving.

*Kasse* is German and Danish for the till: the box the money sits in, and the thing you count at the end of the day.

**Live:** https://kasse-production-8392.up.railway.app  ·  **Contract:** [`openapi.json`](openapi.json)

---

## Where to look first

This README is long because it explains the reasoning behind each decision. If you would rather see it work, this is the short path.

**Run it** in about a minute: [Quickstart](#quickstart). Then `npm run seed:spec` and read the report, which reproduces the sample table exactly.

**The three files worth reading**, if you read nothing else:

| File | Why |
|---|---|
| [`src/common/money/variance.ts`](src/common/money/variance.ts) | The whole product in one pure function. Every awkward case lives here: a plan of zero, a month with no spend, and the difference between "spent nothing" and "no record". |
| [`src/modules/reports/reports.repository.ts`](src/modules/reports/reports.repository.ts) | One aggregation produces the report. It unions plans with spend rather than joining from the plan side, so a category with spend and no plan is not silently dropped, which is the case that matters most. |
| [`src/common/database/base.repository.ts`](src/common/database/base.repository.ts) | Tenancy in one place. Every query is scoped to the account here rather than in each handler, because filtering per handler is one forgotten line away from returning somebody else's financial records. |

**The three decisions most worth disagreeing with**, each argued in place: [money as integer minor units](#money-is-an-integer), [a month as a `YYYY-MM` string](#a-month-is-a-string), and [variance of `null` rather than infinity when the plan is zero](#variance-and-the-three-cases-that-break-it).

**Try the import** without writing a CSV: [`examples/`](examples/) has one that works and one that fails four ways, so the per line error list and the all or nothing write are both visible.

**What is deliberately missing**, and why, is in [Assumptions and tradeoffs](#assumptions-and-tradeoffs) rather than left for you to find.

---

## Table of contents

- [Where to look first](#where-to-look-first)
- [What it does](#what-it-does)
- [Quickstart](#quickstart)
- [The problem it solves](#the-problem-it-solves)
- [Product rules](#product-rules)
  - [Money is an integer](#money-is-an-integer)
  - [A month is a string](#a-month-is-a-string)
  - [Plans are cells, expenses are line items](#plans-are-cells-expenses-are-line-items)
  - [Variance, and the three cases that break it](#variance-and-the-three-cases-that-break-it)
  - [Locking a period](#locking-a-period)
  - [Nothing is hard deleted](#nothing-is-hard-deleted)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
  - [What happens to a request](#what-happens-to-a-request)
  - [The report aggregation](#the-report-aggregation)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment variables](#environment-variables)
- [Database and seeding](#database-and-seeding)
- [API documentation](#api-documentation)
- [Endpoints](#endpoints)
- [Module map](#module-map)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Security](#security)
- [Deployment](#deployment)
  - [What runs where](#what-runs-where)
  - [Branching](#branching)
  - [Deploying from scratch](#deploying-from-scratch)
  - [Verifying a deploy](#verifying-a-deploy)
  - [Failure modes worth recognising](#failure-modes-worth-recognising)
- [Assumptions and tradeoffs](#assumptions-and-tradeoffs)
- [What I would do before production](#what-i-would-do-before-production)

---

## What it does

A finance lead sets a target for each spending category each month. People log what gets spent, by hand or by uploading a spreadsheet. The report puts the two side by side and shows the gap.

When the month is closed, the API refuses to change anything inside it, with an error that says which month and why. Not a hidden button: a `423` from the server, which every path respects including bulk import.

There is also a natural language endpoint. You ask *"how did marketing do in Q1 2026"* and it answers, without the model ever being allowed near the database.

---

## Quickstart

```bash
git clone https://github.com/achowba/kasse.git && cd kasse
npm ci
cp .env.example .env                 # then set JWT_PRIVATE_KEY and JWT_PUBLIC_KEY, see below
docker compose up -d                 # MongoDB as a single node replica set
npm run seed:demo                    # a year of realistic data
npm run start:dev
```

Then open **http://localhost:1413/docs** and sign in as `demo@kasse.app` / `demo-account-password`.

To see the exact numbers from the assignment's sample table instead:

```bash
npm run seed:spec
```

---

## The problem it solves

Budget tracking is easy to build badly, and the bad versions fail in the same few places. This codebase is organised around those failures.

| The failure | What happens | Where it is handled |
|---|---|---|
| Money in floats | `4800.10` becomes `480009` cents and a report is a cent out, forever | [Money is an integer](#money-is-an-integer) |
| Dates instead of months | A timezone moves December spend into January | [A month is a string](#a-month-is-a-string) |
| Dividing by a zero plan | The report shows `NaN`, `Infinity`, or a fabricated 100% | [Variance](#variance-and-the-three-cases-that-break-it) |
| Zero and unknown confused | "we spent nothing" is indistinguishable from "nobody has told us" | [Variance](#variance-and-the-three-cases-that-break-it) |
| Unplanned spend dropped | The most interesting row silently disappears from the report | [The report aggregation](#the-report-aggregation) |
| Locking in the UI only | The API still accepts the edit | [Locking a period](#locking-a-period) |
| Half an import landing | The file cannot be re-uploaded without doubling what did land | [modules/imports](src/modules/imports/README.md) |

---

## Product rules

### Money is an integer

Every amount is a whole number of minor units. `4800.00` is stored as `480000`. A field carrying money ends in `Minor` so the unit is visible at the call site: `targetMinor`, `amountMinor`, `spentMinor`.

Nothing multiplies a float by 100. The CSV import reads the digits of `4800.10` directly and produces `480010`; through a float it would be `480009.99999999994` and truncate to `480009`. There is a test for exactly that.

One currency per account, defaulting to `USD`. Changing it relabels amounts rather than converting them, which the API says explicitly.

### A month is a string

`YYYY-MM`, validated by a pattern. Not a `Date`.

A `Date` carries a time and a timezone, and a budget month has neither. Storing one means an expense logged at 23:30 on 31 January in Lagos can land in February for a reader in London. The string cannot do that. It also sorts lexicographically, so a range is `$gte` plus `$lte` on an ordinary index.

Month arithmetic goes through absolute month indexes, so December plus one is January of the next year rather than month 13.

### Plans are cells, expenses are line items

This asymmetry runs through the whole system.

**A plan is a cell in a grid.** One target per category per month, enforced by a unique index. `PUT /plans` sets it, creating or replacing, so a client never has to know whether one already existed. Two requests racing on the same cell resolve in the database rather than producing a duplicate the report would double count.

**An expense is a line item.** A month's spend on a category is however many of them there were, and the report sums them. There is deliberately no uniqueness rule: collapsing to one record per cell would force a client to read the total, add to it, and write it back, which loses an entry whenever two people log at once.

The consequence is visible everywhere. Re-running the demo seeder overwrites plans and appends expenses. `PATCH` on a plan changes only the amount, while `PATCH` on an expense can move it to another month.

### Variance, and the three cases that break it

```
variance     = spend - plan            (negative means under plan)
variance %   = (spend - plan) / plan * 100
```

Rounded to two decimal places, **half up**, matching `Math.round`. The aggregation reproduces that rule rather than using MongoDB's `$round`, which breaks an exact tie to even and would disagree on `2.125`. A [parity test](test/report-variance-parity.e2e-spec.ts) holds the two implementations together.

| Case | Answer | Why |
|---|---|---|
| **Plan is `0`** | `variancePercent` is **`null`** | Dividing by zero has no answer. Never `NaN`, never `Infinity`, never a fabricated 100%. The absolute variance is still returned and still meaningful: it is the whole of the unplanned spend. Clients render `N/A`. |
| **Nothing logged** | Follows `?missingSpend=` | Under `zero` (the default) the spend is `0` and the variance is the whole target. Under `null` the spend, variance, and percentage are all `null` so a client can render a dash. |
| **Logged `0`** | Not the same as nothing logged | Both sum to zero, so the sum cannot tell them apart. `hasSpend` can, and it is always returned whichever policy is in force. |

The default is `zero` because it matches the sample table, where a month with a target and no spend shows a variance of the full target rather than a dash. Both readings are defensible; the requirement is that it is consistent and stated.

### Locking a period

Closing a month makes it read only. **Enforced by the server**, not by hiding a button:

```
HTTP 423 Locked
{ "code": "PERIOD_LOCKED", "message": "2026-01 is locked and cannot be edited.",
  "details": { "month": "2026-01" }, "requestId": "…" }
```

Every mutating path calls the same gate in `PeriodLocksService`. It lives in a service rather than a guard because the month being written is in the request body or in the record being changed, not in the route, and because a rule enforced only at the HTTP edge is a rule the CSV import bypasses.

Two details that are easy to get wrong:

- **A move is checked at both ends.** Changing an expense's month alters the totals of two periods. Checking only the destination would let someone empty a closed month by moving records out of it.
- **A quarter expands to three months.** `{ "quarter": "2026-Q1" }` writes three lock records, so there is one data shape and a single month of a closed quarter can be reopened without a special case.

Unlocking exists, is scoped to the account, and is audited.

### Nothing is hard deleted

Every removal sets `deletedAt`. There is no `deleteOne`, `deleteMany`, or `findOneAndDelete` anywhere in application code.

A locked period must keep resolving what it referenced, and a mistaken delete must be recoverable without a database restore. Unique indexes are partial on `deletedAt: null`, so deleting a category frees its name for reuse without colliding with the deleted row.

Two documented exceptions: TTL managed refresh tokens, which expire rather than being deleted, and unlocking a period, where an absent row is precisely what "open" means.

---

## Tech stack

| Choice | Why |
|---|---|
| **Node 22, TypeScript strict** | `noUncheckedIndexedAccess` and `noPropertyAccessFromIndexSignature` on. No `any`, no non-null assertions to silence the compiler. |
| **NestJS 11** | Dependency injection makes the tenancy and locking rules testable in isolation, and module boundaries are enforced rather than conventional. |
| **MongoDB 8, Mongoose 9** | The document model fits sparse plan and spend grids, and one aggregation produces the whole report. Run as a single node replica set because the CSV import writes in a transaction. |
| **pino** | Structured JSON, one object per line, with recursive redaction. |
| **argon2id** | Memory hard password hashing, 19 MiB and two passes. |
| **RS256 JWT** | The private key signs and the public key verifies, so a verifying service never holds signing material. |
| **class-validator** | One validation definition serves the HTTP edge, the CSV import, and the natural language endpoint. |

No Redis and no queue, deliberately. See [assumptions](#assumptions-and-tradeoffs).

---

## Architecture

```
src/
  common/     platform and domain primitives, knowing nothing about any feature
  modules/    one folder per feature, each owning its schema, DTOs, service, controller, tests, README
  bootstrap/  server wiring: middleware, versioning, validation, docs
  seed/       command line seeders, deliberately outside the server's module graph
```

Three rules hold it together:

1. **Tenancy is enforced in one place.** `BaseTenantRepository` adds `userId` and `deletedAt: null` to every query. Filtering per handler is one forgotten line away from returning another account's financial records.
2. **A controller only translates HTTP.** Business rules live in services, which is why the seeders and the CSV import can reuse them without going through a route.
3. **No circular dependencies.** `npm run lint:circular` fails the build on any cycle. A cycle compiles and passes mocked unit tests, then fails at runtime as an `undefined` injected dependency naming neither module involved.

### What happens to a request

```
request
  -> pino-http          request id, structured log line, redaction
  -> helmet, CORS       security headers, origin allowlist
  -> throttler          per account once authenticated, per address before that
  -> JwtAuthGuard       global; @Public() opts out
  -> ValidationPipe     whitelist on, unknown properties rejected
  -> controller         translates to a service call
  -> service            period lock gate, tenancy, business rules
  -> repository         tenancy and soft delete applied here, not per handler
  -> audit log          dispatched off the response path
  -> AllExceptionsFilter one error envelope, always
```

### The report aggregation

One round trip produces a page of rows, the totals for the whole range, and the row count.

```
plans      -> { categoryId, month, planMinor: targetMinor, spentMinor: 0 }
expenses   -> { categoryId, month, planMinor: 0,           spentMinor: amountMinor }
                          |  $unionWith
                   $group by cell, $sum both sides
                          |
                   $lookup category name
                          |
      $facet { rows: paged + variance | totals: whole range | count }
```

**Why a union and not a lookup.** Starting at `plans` and looking up matching expenses silently drops any category with spend but no target. That is unplanned spend, usually the most interesting row in a variance report. Unioning both sides keeps a cell that exists on either side alone.

**Why `$facet`.** The totals and the count describe the entire range while only a page of rows comes back, so a summary can never disagree with the table beneath it or shift as the reader pages.

**Soft deletes are filtered here by hand.** Every other read gets that from the base repository, and an aggregation bypasses it entirely. Both `$match` stages carry `deletedAt: null` explicitly, and a test deletes an expense and asserts it leaves the report.

Full detail: [modules/reports](src/modules/reports/README.md).

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22.13+ | `.nvmrc` and `mise.toml` are committed |
| npm | 10.9+ | |
| Docker | any recent | For MongoDB. A local MongoDB works too, but it must be a replica set. |
| OpenSSL | any | To generate the JWT keypair |

---

## Installation

```bash
npm ci
cp .env.example .env
```

Generate a signing keypair. The application expects **base64 encoded PEM**, because a PEM contains newlines and an environment variable that must survive a shell, a Dockerfile, and a platform secret store is far less trouble as one line:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem
openssl rsa -pubout -in private.pem -out public.pem

echo "JWT_PRIVATE_KEY=$(base64 < private.pem | tr -d '\n')" >> .env
echo "JWT_PUBLIC_KEY=$(base64 < public.pem | tr -d '\n')" >> .env

rm private.pem public.pem
```

Start MongoDB and the API:

```bash
docker compose up -d      # database only
npm run start:dev
```

Or run both in containers:

```bash
docker compose --profile app up -d
```

The API listens on **1413**. It says so on startup, along with the URLs worth having:

```
INFO: listening on http://localhost:1413 {"context":"Bootstrap","environment":"development","port":1413,
      "api":"http://localhost:1413/api/v1","health":"…/health","docs":"http://localhost:1413/docs"}
```

---

## Environment variables

| Variable | Purpose | Default | Required |
|---|---|---|---|
| `NODE_ENV` | `development`, `test`, `staging`, or `production`. | `development` | No |
| `PORT` | HTTP port. | `1413` | No |
| `LOG_LEVEL` | pino level. | `info` | No |
| `MONGODB_URI` | Connection string. Must be a replica set member: the CSV import writes in a transaction. | `mongodb://localhost:27017/kasse?directConnection=true` | **Yes** |
| `JWT_PRIVATE_KEY` | Base64 encoded PEM. Signs access tokens. | | **Yes** |
| `JWT_PUBLIC_KEY` | Base64 encoded PEM. Verifies them. | | **Yes** |
| `JWT_ACCESS_TTL_SECONDS` | Access token lifetime. | `900` | No |
| `JWT_REFRESH_TTL_DAYS` | Refresh token lifetime. | `7` | No |
| `CORS_ORIGINS` | Comma separated browser origin allowlist. Strict in staging and production, permissive in development and test. | | Yes in production |
| `THROTTLE_LIMIT` / `THROTTLE_TTL_MS` | Global rate limit. | `120` / `60000` | No |
| `AUTH_THROTTLE_LIMIT` / `AUTH_THROTTLE_TTL_MS` | Credential routes, which are the ones worth brute forcing. | `10` / `60000` | No |
| `REPORT_THROTTLE_LIMIT` | Reports per account per minute. | `60` | No |
| `IMPORT_THROTTLE_LIMIT` | Imports per account per minute. The most expensive request in the system. | `6` | No |
| `EXPENSIVE_THROTTLE_TTL_MS` | The window the two limits above are measured over. | `60000` | No |
| `TOKEN_ISSUER` | Stamped into every access token and required to match when one is verified. | | **Yes** |
| `PUBLIC_URL` | Where the service answers from outside, used only to make the boot log useful. Must include the scheme. | | No |
| `ANTHROPIC_API_KEY` | Enables the natural language endpoint. Without it that one route answers `503` and everything else is unaffected. | | No |

Every one of these is validated at boot, so a missing or malformed value stops the process rather than surfacing at the first request that needs it. Three consequences worth knowing before a first deploy:

- **`TOKEN_ISSUER` has no default.** A value that silently fell back would let one instance sign with the fallback while another verifies against a configured value, and the symptom is a `401` that reads like an authentication bug rather than a configuration one. Changing it invalidates access tokens already issued; refresh tokens are opaque and unaffected, so clients recover on their next refresh.
- **`PUBLIC_URL` is optional but not cosmetic.** Unset in a deployed environment, the boot line reports the port and relative paths rather than inventing a hostname. A process behind a proxy cannot discover its own public address, so it has to be told.
- **`MONGODB_URI` must reach a replica set**, and this is now enforced rather than documented: the service refuses to start against a standalone. See [Deployment](#deployment).

---

## Database and seeding

MongoDB must be a **replica set**, even locally, because the CSV import writes every row in one transaction. `docker compose up -d` starts a single node set and initiates it in the healthcheck.

The service **refuses to start** against a standalone rather than failing later on the routes that need a transaction. The error names the cause and both remedies, which the driver's own message does not. See [common/database](src/common/database/README.md).

| Command | What it writes |
|---|---|
| `npm run seed:spec` | Exactly the four rows of the assignment's sample table, and nothing else. |
| `npm run seed:demo` | A year across ten categories, 100 expenses, a closed quarter, and deliberate unplanned spend. |

Both write to `demo@kasse.app` / `demo-account-password`, and both are deterministic: no `Math.random`, so two runs produce identical data.

Neither writes to a collection directly. They go through the services, so seeded data passes the same validation, produces the same audit entries, and respects the same locks. A seeder writing documents straight into MongoDB could produce a shape the application could never reach, and then the demo would prove nothing.

Indexes are declared on the schemas and created by Mongoose on boot. Details in [data-modeling](.agents/conventions/data-modeling.convention.md).

### Sample CSVs

[`examples/`](examples/) holds two files for trying the import without writing one:

| File | Result |
|---|---|
| [`expenses.csv`](examples/expenses.csv) | `201`, 15 rows written across three months. |
| [`expenses-with-errors.csv`](examples/expenses-with-errors.csv) | `422`, four errors naming their line and column, and **nothing written**. |

Every category in the valid file comes from the shared catalogue seeded at boot, so a brand new account can import it with no other setup. The broken file is there because the per line error list and the all or nothing write are the two things worth seeing, and neither is visible from a file that works. See [examples/README.md](examples/README.md).

---

## API documentation

**http://localhost:1413/docs** — a dark themed Swagger UI with a case insensitive filter. Every endpoint documents what it does, why it behaves that way, and which errors it can answer with.

`openapi.json` is **committed at the repository root**. The frontend lives in a separate repository whose CI cannot reach a running server, so the contract is a file rather than an endpoint. An e2e test regenerates it and fails when the committed copy has drifted, which is what keeps it honest.

```bash
npm run openapi:emit      # regenerate after any contract change
```

Docs are served in every environment **except production**. The UI is a live client against the real API: it invites a reader to press Execute, and on a production deployment that reader is authenticating and writing real records. The contract is still published as the committed file, so nothing is hidden; only the button is.

---

## Endpoints

Base path `/api/v1`. Bearer tokens. Every list endpoint paginates and returns `{ items, pagination: { limit, offset, total } }`.

| Area | Endpoints |
|---|---|
| **Auth** | `POST /auth/{signup,login,refresh,logout}`, `GET /auth/sessions`, `DELETE /auth/sessions/{:id,all}` |
| **Credentials** | `PATCH /auth/password` (ends every other session), `PATCH /auth/email` (keeps them). Both require the current password. |
| **Me** | `GET /me`, `PATCH /me` (currency, fiscal year start) |
| **Categories** | `GET`, `POST /categories`, `PATCH`, `DELETE /categories/:id` |
| **Plans** | `GET /plans`, `PUT /plans` (upsert a cell), `PATCH`, `DELETE /plans/:id` |
| **Expenses** | `GET /expenses` (also the report drill down), `POST`, `PATCH`, `DELETE /expenses/:id` |
| **Locks** | `GET /period-locks`, `POST /period-locks` (months or a quarter), `DELETE /period-locks/:month` |
| **Reports** | `GET /reports/plan-vs-spend`, `/series`, `/export` (CSV) |
| **Imports** | `POST /imports/expenses` (multipart, `Idempotency-Key` required), `GET /imports`, `GET /imports/:id` |
| **Audit** | `GET /audit-log` |
| **NL query** | `POST /reports/nl-query` |
| **Ops** | `GET /health`, `GET /health/ready`, `GET /docs` |

Every error uses one envelope:

```json
{ "statusCode": 423, "code": "PERIOD_LOCKED", "message": "2026-01 is locked and cannot be edited.",
  "details": { "month": "2026-01" }, "requestId": "…", "path": "/api/v1/plans", "timestamp": "…" }
```

Codes: `VALIDATION_FAILED` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `IMPORT_VALIDATION_FAILED` 422, `PERIOD_LOCKED` 423, `RATE_LIMITED` 429, `INTERNAL` 500.

---

## Module map

Every folder carries its own README explaining what it does and why it is built that way.

| Module | Responsibility |
|---|---|
| [`modules/auth`](src/modules/auth/README.md) | Signup, login, rotating refresh tokens with reuse detection, session management. |
| [`modules/users`](src/modules/users/README.md) | Accounts, currency, fiscal year start. |
| [`modules/categories`](src/modules/categories/README.md) | A shared 40 entry catalogue plus each account's own, with archiving. |
| [`modules/plans`](src/modules/plans/README.md) | Monthly targets, addressed as cells. |
| [`modules/expenses`](src/modules/expenses/README.md) | Logged spend as line items, and the drill down. |
| [`modules/period-locks`](src/modules/period-locks/README.md) | Closing periods, and the single gate every write calls. |
| [`modules/reports`](src/modules/reports/README.md) | The aggregation, variance, fiscal years, chart series, CSV export. |
| [`modules/imports`](src/modules/imports/README.md) | Fail closed CSV import with idempotent replay. |
| [`modules/audit-log`](src/modules/audit-log/README.md) | Append only trail, written off the response path. |
| [`modules/nl-query`](src/modules/nl-query/README.md) | Plain language questions, with the model unable to reach the database. |
| [`modules/health`](src/modules/health/README.md) | Liveness and readiness. |
| [`common/*`](src/common/README.md) | Money, months, errors, pagination, tenancy, logging, caching, throttling. |
| [`seed`](src/seed/README.md) | The two deterministic seeders. |

---

## Testing

```bash
npm test          # unit
npm run test:cov  # with coverage thresholds enforced
npm run test:e2e  # against a real MongoDB
```

**413 unit tests and 119 end to end**, 86% statement coverage.

Unit tests sit beside their source and mock external dependencies. End to end tests run against a real in-memory MongoDB replica set, because the things worth testing there are database behaviour: `$unionWith`, `$facet`, transactions rolling back, and unique indexes refusing a duplicate.

The suite brings everything it needs. It starts its own database **and generates its own RSA keypair**, so a fresh clone passes with no setup and no test signing key exists anywhere to leak.

What the tests are actually pinned on:

- The sample table reproduces exactly, both through the aggregation and through the seeder.
- A plan of zero returns `null`, never `NaN` or `Infinity`.
- A logged zero stays distinct from nothing logged.
- A soft deleted expense leaves the report.
- A locked month rejects plan and expense edits, including moving a record out of one.
- A CSV with one bad row writes **nothing**, and a replayed `Idempotency-Key` does not double a month.
- The natural language filter loses `$where`, a `userId`, and an oversized `limit` at the validation boundary.
- The aggregation and `calculateVariance` agree across sixteen cases under both policies.

---

## Project structure

```
src/
  main.ts                      boots the server and says where it started
  app.module.ts                the whole dependency graph in one file
  bootstrap/                   middleware, versioning, validation, Swagger
  common/
    auth/          the authenticated user shape and its decorators
    cache/         the per account data version that invalidates reports
    config/        env validation and typed configuration namespaces
    database/      AbstractDocument, BaseTenantRepository, transaction helper
    errors/        error codes, AppException, the global filter
    logging/       pino options and the recursive redactor
    money/         minor units, amount parsing, calculateVariance
    month/         YYYY-MM parsing, ranges, quarters, fiscal years
    pagination/    the shared list envelope
    throttling/    per account rate limiting
  modules/         one folder per feature, each with schema, DTOs, service, controller, spec, README
  seed/            spec and demo seeders with their own root module
test/              end to end specs, global setup, the committed contract check
examples/          sample CSVs for the import, one valid and one deliberately broken
.agents/           engineering conventions this repository is held to
```

---

## Security

| Concern | Approach |
|---|---|
| Passwords | argon2id, 19 MiB, two passes. Never logged, never returned. |
| Tokens | RS256 access tokens verified with the public key, so the hot path never touches the database. Opaque refresh tokens stored only as SHA-256 hashes. |
| Refresh rotation | Every refresh rotates. Presenting an already used token revokes the whole family, on the reasoning that a loud lockout beats a quiet ongoing compromise. |
| Tenancy | Applied in the repository base, not per handler. A record belonging to someone else answers 404 rather than 403, so the API never confirms it exists. |
| Injection | No string concatenation into queries. The natural language endpoint gives the model a filter schema, never a query, and validates what comes back through the same DTO a hand written request uses. |
| Rate limiting | Per account once authenticated, per address before that. Tighter limits on reports and imports. |
| Secrets in logs | Redacted recursively at any depth, with cycle and depth guards. `.env` and keys are gitignored and no secret has ever been committed. |
| Changing a credential | Both `PATCH /auth/password` and `PATCH /auth/email` require the **current password**, not just a valid token. A token can be lifted from an unlocked machine, and the address in particular *is* the login identity, so changing it on a token alone would hand the account over. |
| Timing | An unknown email still hashes a password on login, so a missing account is not measurably faster to reject. |
| Starting up | The service refuses to boot against a database that cannot run transactions, rather than failing later on the routes that need one. |

---

## Deployment

Live at **https://kasse-production-8392.up.railway.app**

```bash
curl https://kasse-production-8392.up.railway.app/api/v1/health/ready
# {"status":"ok","info":{"database":{"status":"up"},"memory_heap":{"status":"up"}}}
```

`/docs` answers `404` there, deliberately. The documentation UI is withheld in production and available in every other environment.

### What runs where

| Piece | Choice | Why |
|---|---|---|
| Runtime | Railway, one service, two environments | Container platform with no cluster to operate. The work is the API, not the infrastructure. |
| Database | MongoDB Atlas | Always a replica set, so transactions work with no extra configuration. |
| Image | Multi-stage Dockerfile, non root, `dumb-init`, no dev dependencies | `dumb-init` reaps zombies and forwards `SIGTERM`, so shutdown hooks actually run and connections close rather than being dropped. |
| Health | `/api/v1/health` liveness, `/api/v1/health/ready` readiness | Liveness answers if the process is up. Readiness touches MongoDB, so a rolling deploy does not send traffic to an instance that cannot reach its database. |

### Branching

`main` is the integration branch and every pull request lands there. **`production` only ever fast forwards from `main`**, never taking a direct or forced push, and that is what Railway deploys.

```bash
git checkout production && git merge --ff-only main && git push
```

`--ff-only` is the point: it refuses rather than creating a merge commit, so `production` cannot silently diverge from what was reviewed. CI runs on pushes to both branches, so the full gate runs against exactly what deploys.

### Deploying from scratch

**1. Atlas.** Create the cluster, then a database user, then **Network Access → `0.0.0.0/0`**. Railway's egress address is dynamic, so pinning one address does not hold. Skipping this produces a failure that does not look like what it is:

```
MongooseServerSelectionError: Could not connect to any servers in your MongoDB Atlas cluster
  reason: ReplicaSetNoPrimary
  error:  ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR
```

Atlas rejects a disallowed address at the TLS layer, so an access list problem arrives as a TLS error rather than a timeout. The tell is timing: all retries complete in the same second, whereas a genuinely unreachable host burns the five second server selection timeout on each attempt.

**2. Generate a keypair for that environment.** Never reuse the local one.

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem
openssl rsa -pubout -in private.pem -out public.pem
base64 < private.pem | tr -d '\n' | pbcopy   # JWT_PRIVATE_KEY
base64 < public.pem  | tr -d '\n' | pbcopy   # JWT_PUBLIC_KEY
rm private.pem public.pem
```

**Base64, not the PEM itself.** A PEM contains newlines and an environment variable is one line. Pasting the raw PEM is caught at boot rather than at the first login, because validation decodes both keys and checks for the PEM marker.

**3. Set the variables.** Everything from [Environment variables](#environment-variables) that is required, plus:

| Variable | Value | Note |
|---|---|---|
| `NODE_ENV` | `production` | Withholds `/docs` and makes the CORS allowlist strict. |
| `PORT` | `1413` | Set it explicitly. Railway routes to this port, and leaving it unset means the app binds its own default while the proxy targets something else. |
| `PUBLIC_URL` | the generated domain, with `https://` | Without it the boot log reports the port and relative paths instead of an address. |
| `TOKEN_ISSUER` | `kasse-api` | Required. Per environment values are fine and are what makes a staging token unusable against production. |
| `CORS_ORIGINS` | the deployed frontend origin | Exact match outside development. A missing entry fails every browser request at preflight while `curl` keeps working. |

**4. Generate a domain** in Railway before setting `PUBLIC_URL`, since the value has to match.

**5. Push to `production`** and read the boot line:

```
listening on https://kasse-production-8392.up.railway.app
port: 1413   environment: production
api:    https://kasse-production-8392.up.railway.app/api/v1
health: https://kasse-production-8392.up.railway.app/api/v1/health
```

### Verifying a deploy

Health alone does not prove much: the process can be up while the database is unreachable, and reads can work while transactions do not.

```bash
BASE=https://kasse-production-8392.up.railway.app/api/v1

curl -s $BASE/health/ready                      # database: up
TOKEN=$(curl -s -X POST $BASE/auth/signup -H 'Content-Type: application/json' \
  -d '{"email":"smoke@example.test","password":"a-long-enough-password"}' | jq -r .accessToken)
curl -s -X POST $BASE/auth/refresh ...          # exercises a transaction
```

**Refresh is the meaningful check.** It rotates tokens inside a transaction, so a `200` proves the deployment can do the thing a standalone database cannot. Everything else can pass while that is broken.

### Failure modes worth recognising

| Symptom | Cause |
|---|---|
| `Invalid environment configuration: ...` at boot | A required variable is missing or malformed. The message names it. |
| `MongoDB is a standalone deployment` at boot | The database is not a replica set. Cannot happen on Atlas. |
| TLS internal error, retries finishing instantly | Atlas access list, not a network problem. |
| Boot line says `listening on port 1413` rather than a URL | `PUBLIC_URL` is unset. Cosmetic. |
| `401` on every request straight after a deploy | `TOKEN_ISSUER` changed. Clients recover on their next refresh, within the access token lifetime. |
| Browser requests fail while `curl` works | `CORS_ORIGINS` does not list the frontend origin. |

### Running the image directly

```bash
docker build -t kasse-api .
docker run -p 1413:1413 --env-file .env kasse-api
```

### On AWS

ECS Fargate behind an ALB, the image in ECR, and secrets in Secrets Manager rather than environment variables, which is the one real difference: Railway holds them as plain variables, so a compromised dashboard is a compromised signing key. DocumentDB or Atlas for the database, noting that DocumentDB's transaction support is not identical and would need the CSV import path re-verified. CloudWatch consumes the JSON logs the application already emits, with no format change, and the request id is already on every line for correlation.

---

## Assumptions and tradeoffs

| Decision | Reasoning | What it costs |
|---|---|---|
| **No queue or Redis** | The CSV import parses, validates, and writes inside one request. Adding a broker for one endpoint would make it the only infrastructure in the system. | Import is capped at 10,000 rows and 5 MB. Past that the right answer is a background job, and the cap is enforced rather than implied. |
| **Report cache is in process** | Keyed by a per account data version that every write increments, so invalidation is exact rather than time based and a stale report is unreachable. | Each instance caches independently. Correct but not shared; a second instance means a second cache. |
| **Rate limiting is in process** | Same reasoning. | Two instances mean roughly double the limit. `@nestjs/throttler` takes a shared store when that matters. |
| **Audit writes are dispatched** | The change has already committed when the entry is written. Awaiting it meant a failed audit returned `500` for a successful change, and a retrying client duplicated the expense. | A `SIGKILL` with entries buffered loses them. Shutdown flushes, and a failed write is logged in full. |
| **Shared category catalogue** | 40 categories with no owner, readable by everyone. | Copying them per signup would mean 40 stale duplicates per account, so categories need their own repository rather than plain tenancy. |
| **Variance computed in the pipeline** | The database does the arithmetic, but `calculateVariance` remains the definition, exhaustively unit tested without a database. | Two implementations, held together by a parity test. That test found a real `-0` bug on its first run. |
| **One currency per account** | Amounts are stored with no currency of their own. | Multi-currency would need a currency on every record and a rate table. Out of scope, and said so rather than half built. |
| **Email changes are not verified** | `PATCH /auth/email` moves the account immediately, requiring the current password. Nothing confirms the new address can receive mail. | Verification needs a token delivered to the address, which needs the same email transport a password reset would. A typo therefore moves an account to an address its owner may not read, recoverable only with the current password. Out of scope, and said so rather than half built. |
| **No password reset** | A signed in user can change their password at `PATCH /auth/password`, which requires the current one and ends every other session. Recovering a *forgotten* password is not implemented. | A reset needs a single use token delivered to the address on the account, which needs an email transport this deployment has no provider for. Adding one would mean a new external integration and credentials in every environment, for something no requirement asks for. Out of scope, and said so rather than half built. |

---

## What I would do before production

1. **Shared cache and rate limit store.** Both are per instance today. The first thing that breaks on a second replica.
2. **A durable audit path.** The dispatcher loses buffered entries on `SIGKILL`. A broker, or writing the entry in the same transaction as the change.
3. **Import as a background job.** Lift the row cap by moving the work off the request, with a status endpoint to poll.
4. **Metrics and tracing.** Structured logs and request ids are in place; there is no `/metrics` and no span propagation.
5. **Refresh token reuse alerting.** The family revoke is detected and logged loudly, and nothing pages anyone.
6. **Per category budgets across fiscal years**, and a rollover of underspend, both of which real finance teams ask for immediately.
7. **Soft delete retention.** Nothing is ever purged. A real deployment needs a retention policy and a lawful deletion path.
8. **Email verification and password reset.** Both need an email transport this deployment has no provider for. Today an address change takes effect unverified, and a forgotten password has no recovery path. The first is the more pressing of the two: a typo moves an account to an address its owner may not be able to read.
