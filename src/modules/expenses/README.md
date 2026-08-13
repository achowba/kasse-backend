# modules/expenses

Money actually spent: the side of the report a plan is measured against.

## An expense is a line item, not a cell

This is the opposite of a plan, and the difference is the reason the two modules are not symmetrical.

A plan is one target per category and month, enforced by a unique index. An expense is one line item, and a month's spend on a category is however many of them there were. The report sums them into the figure it calls **spend**.

There is deliberately no uniqueness rule and no upsert here. Collapsing to one record per category and month would force a client to read the current total, add to it, and write it back, which loses an entry whenever two people log at once. Appending a row has no such race.

That is also why the vocabulary splits: **expenses** are the records a user creates, **spend** is the figure they sum to. Only the report uses the second word.

## Correcting an expense can move it between periods

`PATCH` accepts a new month, which `PATCH /plans` does not. Spend genuinely lands in the wrong month, usually because an invoice was dated differently from when the cost was incurred, and correcting that is an edit rather than a different record.

That makes this the one place the lock has to be checked at **both** ends:

- The month the expense is **joining**, because its total changes.
- The month the expense is **leaving**, because its total changes too.

Checking only the destination would let a user empty a closed period by moving its expenses out of it, which is exactly what a lock exists to prevent. `PeriodLocksService.assertMoveAllowed` is the gate, and a test asserts both months reach it.

## A negative amount is valid

A refund or a credit note is real spend in the other direction, so amounts are not constrained to be positive. The bounds that do exist reject corrupt input rather than capping a budget: past `Number.MAX_SAFE_INTEGER` an integer amount can no longer be trusted.

## An expense belongs to a month, not a date

The month is a `YYYY-MM` string. Nothing here is a timestamp, so no timezone can shift spend into the wrong period, and a range is `$gte` plus `$lte` on an ordinary index.

## The list endpoint is also the report drill down

Clicking a report cell asks for one category in one month, which is `categoryId` with `from` and `to` set to the same month. That is a query `GET /expenses` already expresses, so there is no second endpoint that could disagree with this one. Filtering by `importBatchId` answers what a given file put in.

## Deletes are soft

The audit trail keeps what the expense was, so a report run before the deletion can still be explained.

## Indexes

| Index | Serves |
|---|---|
| `{ userId, month, categoryId }` | Date range scans and the report aggregation. Equality on the owner, then range on the month, then the category filter, which is the order a range scan wants. |
| `{ userId, importBatchId }` | Reading back or undoing everything one import wrote. |

## How it relates to the rest of the project

Reads the lock gate from `@modules/period-locks` and category visibility from `@modules/categories`, and records through `@modules/audit-log`. Exports its service and repository so the report aggregation, the CSV import, and the seeders can write and read expenses without going through HTTP.

`createManyFromImport` is the import's entry point. It skips the per row lock check on purpose, because the import checks every month in the file in one query before writing anything; the rule is not bypassed, only checked once instead of per row.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/expenses` | List expenses, filtered by month range, category, or import batch. |
| `POST` | `/api/v1/expenses` | Log an expense. |
| `PATCH` | `/api/v1/expenses/:expenseId` | Correct an expense, including moving it to another month. |
| `DELETE` | `/api/v1/expenses/:expenseId` | Soft delete an expense. |

Every mutating route can answer `423` with the code `PERIOD_LOCKED`.

## Dependencies on other modules

`@modules/period-locks`, `@modules/categories`, `@modules/audit-log`, plus `@common/month` for the format, `@common/pagination`, `@common/pipes`, `@common/auth`, and `@common/request-context`.
