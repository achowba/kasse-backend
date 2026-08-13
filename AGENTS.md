# AGENTS.md

Engineering standards for this repository, for humans and for AI coding agents alike.

**This file is an index and must stay one.** Every rule lives in a file under `.agents/conventions/`, listed here with a single line. Read the relevant convention before writing code in that area. Do not add detailed rules to this file, and do not restate a rule that already has a home. One rule, one place.

## Critical invariants

Non-negotiable. Each line links to the convention that holds the detail.

1. **Strictest typing.** No `any`, no untyped object, no assertion used to silence the compiler. [code standards](.agents/conventions/code-standards.convention.md)
2. **Every query is scoped to the authenticated user** in the repository layer, never handler by handler. [security](.agents/conventions/security.convention.md)
3. **A locked period is enforced server side** by one gate that every mutating path calls. [data modeling](.agents/conventions/data-modeling.convention.md)
4. **Money is an integer count of minor units.** Never a floating point number. [data modeling](.agents/conventions/data-modeling.convention.md)
5. **Data is never hard deleted.** Every removal is a soft delete. No `deleteOne`, `deleteMany`, or `findOneAndDelete` in application code. [data modeling](.agents/conventions/data-modeling.convention.md)
6. **Log before you throw.** Never swallow an error in a handler, a lifecycle hook, or an async task. [logging](.agents/conventions/logging.convention.md), [error handling](.agents/conventions/error-handling.convention.md)
7. **No secret in a log, a commit, or a response body.** [security](.agents/conventions/security.convention.md)
8. **Every change to financial data is audited.** [data modeling](.agents/conventions/data-modeling.convention.md)
9. **Every function and method carries TSDoc,** above the declaration and never inside it, and a module's README changes in the same commit as the module. [tsdoc](.agents/conventions/tsdoc.convention.md), [documentation](.agents/conventions/documentation.convention.md)
10. **Every commit is `type(scope): description`** with a required scope, and every change reaches `main` through a pull request whose title is a sentence rather than a commit subject. [commits](.agents/conventions/commits.convention.md), [labels](.agents/conventions/labels.convention.md)

## Conventions

| Convention | Covers |
|---|---|
| [api-design](.agents/conventions/api-design.convention.md) | REST shape, DTO boundaries, pagination, status codes, versioning, idempotency. |
| [artifacts](.agents/conventions/artifacts.convention.md) | Where plans, reviews, and notes are written, and how they are named. |
| [code-standards](.agents/conventions/code-standards.convention.md) | Typing, naming, async, module boundaries, file size. |
| [commits](.agents/conventions/commits.convention.md) | Conventional Commits, required scopes, branch names, and how a pull request differs from a commit. |
| [labels](.agents/conventions/labels.convention.md) | The label taxonomy, its local cache, and how to apply and upsert one. |
| [data-modeling](.agents/conventions/data-modeling.convention.md) | Schemas, indexes, money, months, tenancy, locking, auditing. |
| [documentation](.agents/conventions/documentation.convention.md) | TSDoc on every function, and the module README contract. |
| [error-handling](.agents/conventions/error-handling.convention.md) | The error envelope, error codes, what a client is told. |
| [language-and-style](.agents/conventions/language-and-style.convention.md) | How prose in this repo is written. |
| [logging](.agents/conventions/logging.convention.md) | Levels, structured fields, redaction. |
| [performance](.agents/conventions/performance.convention.md) | Indexes, N+1, pagination, caching, transactions. |
| [security](.agents/conventions/security.convention.md) | Validation, tenancy, secrets, hashing, rate limits. |
| [testing](.agents/conventions/testing.convention.md) | Layout, naming, coverage, determinism. |
| [tsdoc](.agents/conventions/tsdoc.convention.md) | Where a doc block goes, which tags exist, what it must say. |

## Layout

| Path | Holds |
|---|---|
| `src/common/` | Platform and domain primitives with no knowledge of any feature. |
| `src/modules/` | One folder per feature, each owning its schema, DTOs, service, controller, tests, and README. |
| `src/seed/` | Seed entry points. |
| `test/` | End to end specs. |
| `.agents/conventions/` | The standards above. |
| `.agents/skills/` | Repeatable workflows: PR description, review, test generation. |
| `artifacts/` | Workflow output. Not committed. See the artifacts convention. |
