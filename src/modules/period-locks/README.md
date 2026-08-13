# modules/period-locks

Closed accounting periods, and the gate that enforces them.

## The gate

`assertUnlocked(userId, month, session?)` is the single place a closed period is enforced. Every path that writes a plan or an actual calls it, including every row of a CSV import.

It lives in a service rather than a guard or an interceptor for two reasons:

1. **The month is not in the route.** It is in the request body, or in the record being changed, so a route-level guard would have to reach into the payload and guess.
2. **The import never passes through a route per row.** A rule enforced only at the HTTP edge is a rule that a bulk path silently bypasses, which is precisely the kind of gap that makes a lock look enforced while not being.

The API rejects a locked write with `423` and the code `PERIOD_LOCKED`, with the month in `details`. Hiding a control in a client is not what makes a period read only.

## Three checks, one rule

| Method | Used by |
|---|---|
| `assertUnlocked` | Creating or changing a single plan or actual. |
| `assertMoveAllowed` | Changing a record's month. Checks the source and the destination. |
| `assertAllUnlocked` | A CSV import. One query for every month in the file. |

`assertMoveAllowed` exists because moving spend **out** of a closed month changes that month's totals, so it is an edit to it. Checking only the destination would let a user empty a closed period by moving its records elsewhere, which is the exact thing a lock is there to prevent.

`assertAllUnlocked` is a batch check so an import spanning a year issues one query rather than twelve before writing anything. It reports the earliest locked month, so the message is deterministic rather than depending on document order.

## Month is the unit

Locking a quarter writes three month records. One data shape and one query answer both granularities, and a single month of a closed quarter can be reopened without a special case.

Quarters are calendar quarters: Q1 is January through March, whatever an account's fiscal year start is.

## Absence is the unlocked state

There is no `locked` boolean and no soft deleted lock. Unlocking removes the row.

This is the one deliberate departure from soft-delete-only, and it is narrow: a lock is a fact about a period rather than data a user owns, the audit log already records that the period was reopened and by which request, and keeping tombstones would break the unique index that makes locking idempotent. Both the exception and the reasoning are stated in the data-modeling convention.

Locking is an upsert, so closing an already closed month is harmless and preserves the original time. Closing a quarter that overlaps a month closed earlier therefore does not rewrite when that happened.

## How it relates to the rest of the project

Exports `PeriodLocksService`, which plans, actuals, and the CSV import all call before writing. Changes are recorded through `@modules/audit-log`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/period-locks` | List closed months, optionally within a range. |
| `POST` | `/api/v1/period-locks` | Close months, or a quarter. |
| `DELETE` | `/api/v1/period-locks/:month` | Reopen one month. |

## Dependencies on other modules

`@common/month` for validation, ordering, and quarter expansion. `@common/database` for the tenant scoped repository. `@common/errors` for the exception base and the error code. `@modules/audit-log` to record locking and unlocking.
