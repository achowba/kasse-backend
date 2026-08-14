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

## The boot refuses a database that cannot do what the code assumes

MongoDB runs standalone or as a replica set, and **transactions only work on a replica set**. Not because they need several machines, but because the machinery is built on the replication log, which only exists in replica set mode. A single node replica set is a real one.

A standalone accepts the connection, serves every read, and serves every single document write. It fails only when a transaction starts, which here means refresh token rotation and CSV import. So the service starts perfectly and then fails later, at a moment disconnected from the cause, with a driver message that actively misdirects:

```
This MongoDB deployment does not support retryable writes.
Please add retryWrites=false to your connection string.
```

That advice does not work. It disables an unrelated retry layer and moves the same failure one step later.

`TopologyCheck` runs at boot, sends `hello`, and reads `setName`. Present means a replica set and the boot continues silently. Absent means the process stops, with a message naming the cause, what depends on it, and both ways to fix it.

### Why it refuses rather than warns

The obvious objection is that it blocks a developer who only wants to read reports. That does not survive contact with this application: refresh token rotation runs in a transaction and an access token lives fifteen minutes, so anybody using the service for longer than that reaches a transaction whether or not they touch an import. A standalone does not break an edge case here, it breaks every session that outlives one token.

Warning would therefore buy a service that works for fifteen minutes and then fails away from its cause. It is also the position this codebase already takes with configuration, where a missing variable stops the process rather than surfacing at the first request that needs it.

It costs almost nothing. Every deployed environment uses Atlas, which is always a replica set, so this can only fire locally, and `docker compose up -d` already starts a single node set and initiates it in its healthcheck.

## How it relates to the rest of the project

Every feature module that persists anything extends `BaseTenantRepository` and registers its schema against this connection. `modules/health` uses the connection for its readiness check.

`autoIndex` is on in every environment. That is deliberate: several declared indexes are not performance tuning but correctness, such as the unique index that enforces one plan per user, category, and month. At a volume where building them at boot is slow, this moves to a migration step.

## Endpoints

None.

## Dependencies on other modules

`@common/config` for the connection string and the index policy.
