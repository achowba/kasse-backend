# common/database

The connection, the document base classes, and the repository that enforces the data invariants.

## What it does

`DatabaseModule` owns the Mongoose connection. It is global, so a feature module registers its schemas with `MongooseModule.forFeature` without re-importing the connection.

`AbstractDocument` and `TenantOwnedDocument` are the base classes every schema extends. They contribute `deletedAt` to everything and `userId` to everything a user owns.

`BaseTenantRepository` is where two invariants are enforced structurally rather than by discipline:

1. **Tenancy.** Every query is scoped to the authenticated user. Filtering per handler is one forgotten line away from returning another account's financial records, and that omission is invisible in review because the code still works.
2. **Soft delete.** Every read excludes deleted records. Nothing here is hard deleted, so a read that forgot the filter would resurrect deleted rows in a report.

`findByIdIncludingDeleted` is the one read that sees deleted records. It exists for audit and restore, and is named awkwardly on purpose so it is not reached for by accident.

`withTransaction` runs a unit of work atomically. It is what makes the CSV import all or nothing: a bad row at line 400 cannot leave the first 399 behind.

## Two things a caller must know

- **Pass the session.** An operation inside `withTransaction` that does not receive the session runs outside the transaction and will not roll back.
- **The callback may run twice.** `withTransaction` retries on a transient error such as a write conflict, so the unit of work must be safe to repeat.

## How it relates to the rest of the project

Every feature module that persists anything extends `BaseTenantRepository` and registers its schema against this connection. `modules/health` uses the connection for its readiness check.

`autoIndex` is on in every environment. That is deliberate: several declared indexes are not performance tuning but correctness, such as the unique index that enforces one plan per user, category, and month. At a volume where building them at boot is slow, this moves to a migration step.

## Endpoints

None.

## Dependencies on other modules

`@common/config` for the connection string and the index policy.
