# API design convention

## Shape

- All routes live under `/api/v1`. A breaking change to a response gets a new version, it does not mutate the old one.
- Paths name resources in plural: `/plans`, `/expenses`, `/period-locks`.
- The API is client agnostic. It assumes nothing about a browser. Sessions travel in the `Authorization` header, never in a cookie, so a mobile or desktop client is a first class caller.

## Methods and status codes

| Case | Method and status |
|---|---|
| Create | `POST`, `201` |
| Full replace or upsert by natural key | `PUT`, `200` |
| Partial update | `PATCH`, `200` |
| Delete or archive | `DELETE`, `204`. Always a soft delete server side. |
| Read | `GET`, `200` |
| Validation failure | `400` |
| Missing or invalid credentials | `401` |
| Authenticated but not permitted | `403` |
| Unknown or not owned by the caller | `404` |
| Conflicts with an existing record | `409` |
| Well formed but semantically rejected, such as a failed CSV | `422` |
| Locked period | `423` |
| Rate limited | `429` |

A record the caller does not own returns `404`, not `403`. Confirming that another user's record exists is a leak.

## Documentation

Every controller and every route is documented well enough that a reader never needs the source. The generated `openapi.json` is the contract the web client builds from, so an undocumented field effectively does not exist.

On the controller:

- `@ApiTags` groups the routes.
- `@ApiBearerAuth` on anything that requires a session.

On every route:

- `@ApiOperation` with a `summary` and a `description`. The summary is a short phrase; the description says what the route does, what it validates, and any rule a caller could not infer from the schema, such as which errors are possible and why.
- `@ApiResponse` for every status the route can actually return, each with the DTO it returns. Include the failures: `401`, `404`, `409`, `423`, not only the happy path.
- `@ApiParam` and `@ApiQuery` where a parameter needs more than its name.

A response class carries `@ApiProperty` on every field, with a description and an example. An enum field declares its `enum` so the values appear in the document.

## DTOs

- A request is a DTO class with `class-validator` decorators. The global pipe whitelists, strips unknown properties, and rejects a request that carries them.
- A response is a DTO too. Never return a Mongoose document directly: it leaks `__v`, internal fields, and any column added later.
- A DTO carries Swagger decorators. The generated `openapi.json` is the contract the web client builds its types from, so an undocumented field does not exist.

## Lists

Every list endpoint paginates. There are no unbounded collection reads.

```json
{ "items": [], "pagination": { "limit": 50, "offset": 0, "total": 0 } }
```

- `limit` defaults to 50 and is capped.
- A total computed for a filtered set is computed over the whole set, not the page.
- Filters are explicit query parameters with their own validation. No free form filter object from the client.

## Idempotency

- A `POST` that could be retried and would double post a financial record requires an `Idempotency-Key` header.
- Replaying a key returns the original result rather than performing the work again.

## Nulls

- `null` means "not known" and is distinct from `0`, which means "known to be zero". A report row carries `hasActual` so the two are never confused.
- An undefined percentage is `null`, never `NaN` and never `Infinity`.
