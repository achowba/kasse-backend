# Data modeling convention

## Money

- Money is an integer count of minor units. A field named `targetMinor` or `amountMinor` holds cents.
- Never store or compute money as a floating point number. `0.1 + 0.2` is not `0.3`, and a reporting total that is wrong by a cent is a wrong report.
- Minor units are safe as a BSON double up to 2^53, which is more than any realistic budget. `Decimal128` is not needed while every amount is an integer.
- One currency per user. A currency field lives on the user, not on each row. Mixed currency totals need an exchange rate policy, which is out of scope.
- A plan target is zero or positive. An actual may be negative, because credit notes and refunds exist.

## Months and periods

- A month is the string `YYYY-MM`, validated against `/^\d{4}-(0[1-9]|1[0-2])$/`.
- This is deliberate. The format sorts lexicographically, so a range filter is `$gte` and `$lte` on an ordinary index, and no timezone can move a record into a neighbouring month. A `Date` would reintroduce both problems.
- A quarter is derived from months, never stored. Locking a quarter writes three month locks.

## Tenancy

- Every collection except the shared category catalogue carries `userId`.
- Scoping happens in the repository layer, so a handler cannot leak another user's rows by forgetting a filter. Do not write a bare `Model.find()` in a service.
- A shared catalogue row has `userId: null`, is readable by every user, and is not editable by any of them.

## Indexes

- Every query pattern has an index. Add it in the schema next to the fields it covers, not in a migration nobody reads.
- Order a compound index by equality first, then range, then sort. `{ userId: 1, month: 1, categoryId: 1 }` serves a user's date range scan and its category filter.
- A uniqueness rule is a unique index, not a check in application code. One plan per user, category, and month is `unique { userId, categoryId, month }`.
- A record with a natural expiry uses a TTL index rather than a cleanup job.

## Lifecycle

- Financial records are archived, never hard deleted. A locked period must keep resolving the names it referenced.
- A category carries `archivedAt`. Archiving hides it from pickers and leaves history intact.

## Locking

- One service method decides whether a period is writable. Every mutating path calls it: create, update, delete, and each imported row.
- The check lives in the service layer, so no route can bypass it and no client can bypass it by calling the API directly.
- Changing a record's month checks both the old month and the new one. Moving spend out of a locked period is an edit to that period.

## Auditing

- Every change to a plan, an actual, or a lock writes an audit record with the actor, the action, the entity, the before value, the after value, and the request id.
- The audit collection is append only. No code path updates or deletes a row in it.
- Audit records hold no IP address and no user agent. Those are personal identifiers, and the trail's job is to say what changed and by which account.
