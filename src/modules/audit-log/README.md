# modules/audit-log

The append only trail of changes to financial data.

## What it does

Every change to a plan, an actual, a category, or a period lock is recorded here with the state before and after, the account that made it, and the id of the request that carried it.

## Why before and after, not just after

Storing only the new value answers "what is it now", which the record itself already answers. Storing both answers "what changed", which is the question anyone actually asks when a number looks wrong.

It is also what makes soft delete useful. A deleted plan is hidden from every read, but the entry recording its deletion still carries what it looked like, so the trail explains a report that changed shape.

## Append only

The repository offers `append` and reads. It offers no update and no delete, so no service can call one: the rule is enforced by what exists rather than by a comment. The controller is read only for the same reason, and entries are written by the services making the changes, never by a client.

`deletedAt` exists on an entry because it is inherited from the document base, and is never set. An audit entry that could be soft deleted would not be evidence of anything.

## What is deliberately not recorded

No IP address and no user agent. Both are personal identifiers, and neither helps answer what changed or by which account. The `requestId` covers the correlation need without storing anything about a person.

## Transactions

When a change runs inside a transaction, its audit entry is written with the same session. A rolled back change therefore leaves no entry claiming it happened, and a committed change cannot commit without its entry.

## How it relates to the rest of the project

Exports `AuditLogService`, which categories, plans, actuals, period locks, and the CSV import all call. Reads go through this module's own controller.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/audit-log` | Read the caller's trail, newest first, filterable by entity, action, and record. |

## Dependencies on other modules

`@common/database` for the tenant scoped repository, `@common/pagination` for the list shape, `@common/auth` for the caller.
