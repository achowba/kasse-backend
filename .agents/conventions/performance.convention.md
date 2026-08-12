# Performance convention

## Indexes

- Every field used to filter, sort, or look up has an index. Add it to the schema beside the field, not in a migration nobody reads.
- Order a compound index by equality, then range, then sort.
- Before optimising a slow query, run `explain()` and read the stage. A guess about which index is used is not a finding.
- An index is not free. It costs write throughput and storage, so each one must serve a query pattern that actually exists.

## Query patterns

- No N+1. If a loop issues one query per iteration, replace it with a single aggregation or one batched read.
- Let the database aggregate. Summing rows in application code means transferring every row to sum it.
- Project only the fields needed. A report that needs a category name does not need its whole document.
- Use `lean()` for a read that is never saved. Hydrating a full Mongoose document for a read only path is wasted work.

## Pagination

- Every list endpoint paginates, with a default limit and a hard cap. There are no unbounded reads.
- A total over a filtered set is computed over the whole set while only a page of rows is returned. `$facet` does both in one pass, so the table and its totals cannot disagree.

## Caching

- Cache only what is read often and written rarely, and only where the gain is measurable.
- Invalidation is explicit and exact. A per user version counter bumped on every write is preferred over a short time to live and hoping.
- A cache key includes every input that changes the result, including the caller's id. A key that omits the user id is a data leak.
- A time to live is a backstop against a missed invalidation, not the invalidation strategy.

## Transactions

- A transaction wraps the smallest possible unit of work. Never hold one open across a network call to a third party.
- Validate everything before opening the transaction. A transaction that aborts on the last row wasted the work of all the others.

## Streaming

- Parse an uploaded file as a stream. Do not read a whole upload into memory to count its rows.
- Stream a large export to the response rather than building the entire body first.

## Timeouts

- Every outbound call has a timeout. A call with no timeout can hold a request open until the platform kills it.
- Reuse the connection pool. Do not open a connection per request.
