# modules/audit-log

The append only trail of changes to financial data.

## What it does

Every change to a plan, an expense, a category, or a period lock is recorded here with the state before and after, the account that made it, and the id of the request that carried it.

## Why before and after, not just after

Storing only the new value answers "what is it now", which the record itself already answers. Storing both answers "what changed", which is the question anyone actually asks when a number looks wrong.

It is also what makes soft delete useful. A deleted plan is hidden from every read, but the entry recording its deletion still carries what it looked like, so the trail explains a report that changed shape.

## Append only

The repository offers `append` and reads. It offers no update and no delete, so no service can call one: the rule is enforced by what exists rather than by a comment. The controller is read only for the same reason, and entries are written by the services making the changes, never by a client.

`deletedAt` exists on an entry because it is inherited from the document base, and is never set. An audit entry that could be soft deleted would not be evidence of anything.

## What is deliberately not recorded

No IP address and no user agent. Both are personal identifiers, and neither helps answer what changed or by which account. The `requestId` covers the correlation need without storing anything about a person.

## The write is off the response path

`record` buffers the entry and returns. It does not await the insert, and it never throws.

The reason is not only latency. The change an entry describes has **already committed** by the time `record` is called, so an error from the audit write would turn a successful change into a `500`. A client seeing that would retry, and the retry would duplicate the expense that was in fact written the first time. Awaiting the entry makes the audit trail able to corrupt the data it exists to describe.

Buffered entries are written on the next tick, in one batch rather than one insert each.

### What that costs, and what covers it

| Failure | What happens |
|---|---|
| The database rejects a batch | Every entry in it is logged in full at error level, so the trail survives in the application logs. |
| A normal shutdown or rolling deploy | Nothing is lost. The buffer is flushed on Nest's shutdown hook. |
| `SIGKILL` or a process crash | Buffered entries are lost. This is the real gap. |
| The database is unreachable for a long time | The buffer stops growing at `AUDIT_BUFFER_LIMIT` and further entries go straight to the logs, so an outage costs bounded memory rather than the process. |

A durable broker is the production answer to the crash case. It is not here because this service has no queue at all by design, and adding one for the audit trail alone would be the only piece of infrastructure in the system. The README states the volume at which that trade stops being worth it.

### Reading your own writes

`GET /audit-log` flushes the buffer before it queries. Without that, a client that made a change and immediately read the trail could miss the entry it was looking for, which is the most likely entry it wanted. The flush costs nothing when the buffer is empty, which is almost always.

## Transactions

`recordWithin` is the exception, and the one path that still awaits. When a change already runs inside a transaction, such as a CSV import, its entry is written with the same session. A rolled back change therefore leaves no entry claiming it happened, and a committed change cannot commit without its entry.

There is nothing to trade away here: the transaction is open regardless, so the entry costs no extra round trip. The dispatcher deliberately cannot accept a session, because a buffered entry is written after the request that produced it has returned, by which time the session is closed.

## How it relates to the rest of the project

Exports `AuditLogService`, which categories, plans, expenses, period locks, and the CSV import all call. Reads go through this module's own controller.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/audit-log` | Read the caller's trail, newest first, filterable by entity, action, and record. |

## Dependencies on other modules

`@common/database` for the tenant scoped repository, `@common/pagination` for the list shape, `@common/auth` for the caller.
