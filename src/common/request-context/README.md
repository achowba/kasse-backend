# common/request-context

The request id, made available to handlers.

## What it does

`@RequestId()` injects the id the logger assigned to the current request.

## Why it exists

The same id appears in three places: every log line for the request, the `x-request-id` response header, and the `requestId` field of the error envelope. Passing it into an audit entry as well means a recorded change can be tied back to the exact request that made it, which is the difference between "someone changed this" and "this request changed this".

It is a decorator rather than something the audit service reads from ambient storage. Reading it ambiently would be less code at the call site, but it would make the audit service untestable without standing up async local storage, and would hide a dependency the signature otherwise declares.

## How it relates to the rest of the project

Controllers that perform an audited change take a `@RequestId()` parameter and pass it to the service.

## Endpoints

None.

## Dependencies on other modules

None.
