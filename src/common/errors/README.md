# common/errors

The error contract: one envelope, one set of codes.

## What it does

`AllExceptionsFilter` is registered globally, so every failure leaves the API in the same shape regardless of which layer raised it:

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

`ErrorCodeEnum` is the contract a client branches on. `message` is written for a person and may be reworded, so no client should parse it.

Three behaviours worth knowing:

- A 5xx is logged with its stack and answered with a generic message plus the `requestId`. Internal detail belongs in the log, not in a response.
- A 4xx is logged at `info`. A caller's mistake is not the service's error, and error rate is an alerting signal.
- A validation failure returns every invalid field at once, lifted from the pipe's output into `details.errors`.

## How it relates to the rest of the project

Services throw `AppException` subclasses carrying their code and details. The filter is installed in `src/bootstrap/server/`. The `requestId` it stamps comes from the logger in `@common/logging`, and is echoed in the `x-request-id` response header.

## Endpoints

None.

## Dependencies on other modules

None beyond Nest and Express types.
