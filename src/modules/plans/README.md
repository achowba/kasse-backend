# modules/plans

Monthly spending targets: the plan side of the report.

## A plan is a cell, not a record

A target is addressed by category and month, because that is how it is thought about: a cell in a grid. `PUT /plans` sets that cell, creating it or replacing it, so a client never has to know whether a target already existed and sending the same request twice is harmless.

A unique index on user, category, and month enforces it rather than a check in application code, so two requests racing on the same cell also produce one record instead of a duplicate the report would double count. The write is an upsert against that index, so the race resolves in the database rather than surfacing as a duplicate key error the caller has to interpret.

## A target of zero is not the absence of a target

They are different states and the report treats them differently:

- **`targetMinor: 0`** means nothing was planned. Spend against it is real overspend, reported with a variance equal to the whole amount and a `null` percentage, because dividing by zero has no answer.
- **No target at all** means the cell is absent from the plan side entirely.

## Moving a target is not an edit

`PATCH` changes the amount and nothing else. Moving a target to a different category or month would vacate one cell and overwrite another, and either end could be in a closed period. Set the new cell and delete the old one, so each goes through its own lock check.

## Every write does three things first

1. **Confirms the period is open**, through the shared gate in `@modules/period-locks`.
2. **Confirms the caller may use the category**, which covers both a category that does not exist and one belonging to another account.
3. **Records the change**, with the state before and after.

The order is deliberate. Checking the lock first means a write to a closed period is rejected for the reason the user needs to hear, rather than for a category problem they would then fix pointlessly before hitting the real wall.

## Deletes are soft

The audit trail keeps what the target was, so a report run before the deletion can still be explained. Because the unique index is partial on `deletedAt`, the same cell can be planned again afterwards.

## Indexes

| Index | Serves |
|---|---|
| `{ userId, categoryId, month }` unique, partial on `deletedAt` | The one target per cell rule, and the upsert. |
| `{ userId, month }` | Date range scans, and the report aggregation. Equality on the owner then range on the month, which is the order a range scan wants. |

## How it relates to the rest of the project

Reads the lock gate from `@modules/period-locks` and category visibility from `@modules/categories`, and records through `@modules/audit-log`. Exports its repository so the report aggregation and the seeders can read targets without going through HTTP.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/plans` | List targets, filtered by month range and category. |
| `PUT` | `/api/v1/plans` | Set the target for one category and month. |
| `PATCH` | `/api/v1/plans/:planId` | Change the amount of an existing target. |
| `DELETE` | `/api/v1/plans/:planId` | Soft delete a target. |

Every mutating route can answer `423` with the code `PERIOD_LOCKED`.

## Dependencies on other modules

`@modules/period-locks`, `@modules/categories`, `@modules/audit-log`, plus `@common/month` for the format, `@common/pagination`, `@common/pipes`, `@common/auth`, and `@common/request-context`.
