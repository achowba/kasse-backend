# Error handling convention

## One envelope

Every error leaves the API in the same shape, produced by one global exception filter.

```json
{
  "statusCode": 423,
  "code": "PERIOD_LOCKED",
  "message": "2026-01 is locked and cannot be edited.",
  "details": { "month": "2026-01" },
  "requestId": "0f9c1e2a-...",
  "path": "/api/v1/plans",
  "timestamp": "2026-01-15T10:04:11.212Z"
}
```

- `statusCode` is for the transport. `code` is for the client's logic. A client branches on `code`, never on a substring of `message`.
- `message` is written for a person and names the thing that went wrong. Not "Bad request".
- `details` carries the machine readable specifics: the offending month, the failing rows, the invalid fields.
- `requestId` appears in both the response and the logs, so a report of "it failed at 10:04" is traceable.

## Codes

`code` comes from one exported union. Adding an error means adding a member, so the set stays enumerable and documentable.

`VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `IMPORT_VALIDATION_FAILED`, `PERIOD_LOCKED`, `RATE_LIMITED`, `INTERNAL`.

## Throwing

- Throw a typed exception carrying its `code`. Do not throw a bare `Error` from a service.
- Log before you throw, at the level that matches the outcome. A rejected edit to a locked period is expected and logs at `info`. A failed database write is not, and logs at `error`.
- Never swallow. An empty `catch`, or a `catch` that logs and continues as if nothing happened, hides a real failure and is a review blocker.
- Catch only to add context or to translate. Re-throw otherwise, and preserve the original as the `cause`.

## What a client is told

- A `4xx` says exactly what the caller must change.
- A `5xx` says something went wrong and carries the `requestId`. It never carries a stack trace, a driver message, or a query. Those go to the logs.
- A validation failure lists every invalid field at once, not the first one.

## Failure policy

- A financial write is all or nothing. A CSV import validates every row first, then writes in one transaction, so a bad row at line 400 cannot leave 399 rows behind.
- A fallback value is never substituted for a failed read of financial data. Report the failure. A silently wrong number is worse than an error.
