# common/pagination

The query and response shapes every list endpoint shares.

## What it does

`PaginationQueryDto` accepts `limit` and `offset`, converts them from the strings a URL delivers, and rejects anything outside the allowed range. `toPaginatedResponse` wraps a page in the standard envelope:

```json
{ "items": [], "pagination": { "limit": 50, "offset": 0, "total": 0 } }
```

## Two decisions worth knowing

**The cap lives here.** `limit` is bounded by `MAX_PAGE_LIMIT` in the DTO, so no endpoint can be talked into an unbounded read by a client that asks for a million records. Enforcing it per handler would be one forgotten line away from a denial of service.

**`total` counts the whole filtered set, not the page.** A client cannot compute how many pages exist otherwise, and a report's totals would disagree with its own table. In the report this is done with a single `$facet`, so the rows and the total come from one pass over the same data.

Paging is offset based rather than cursor based. The collections here are one user's own categories, plans, and expenses: small, and read with a sort the user chose. A cursor would buy stability under concurrent writes that this data does not experience.

## How it relates to the rest of the project

Every list endpoint takes this DTO and returns this envelope. The defaults and the cap come from `@common/constants`.

## Endpoints

None.

## Dependencies on other modules

`@common/constants` for the default and maximum page sizes.
