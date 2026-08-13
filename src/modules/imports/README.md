# modules/imports

Bulk import of expenses from a CSV file.

## Fail closed

The file is parsed, every row validated, every category resolved, and every month checked against the period locks **before a single expense is written**. Then all of them are written in one transaction. A file lands whole or not at all.

The tempting alternative is to write rows as they validate and stop at the first bad one. It is faster and it is wrong, because it leaves a partial import behind:

> The user fixes row 47 and re-uploads. Rows 1 to 46 are now doubled.

There is no good recovery from that. The user must either hand-delete what landed or reconstruct which rows made it, and both are worse than the upload having simply failed. Failing closed means a corrected file is always safe to re-upload.

An e2e test uploads a three-row file with one bad month and asserts that **zero** expenses exist afterwards, including the two rows that were fine.

## Idempotent

`Idempotency-Key` is required. The same key returns the original batch without importing anything.

This is not defensive decoration. The realistic failure is a client that uploads a large file, times out waiting, and retries. Without the key, that retry doubles a month's spend, and the user has no way to tell from the report which entries are duplicates.

The guard is a **unique index** on `(userId, idempotencyKey)`, not the read that precedes it. Two identical uploads racing both miss the read; the database refuses the second write and the service answers with the batch the winner created. A check in application code would let both through.

The key is required rather than generated server-side, because a key the server invents differs on every retry, which is the one thing it must not do.

## What the file may look like

```csv
category,month,amount,note
Marketing,2026-01,4800.00,Q1 campaign
Payroll,2026-01,20500.00
```

| Rule | Behaviour |
|---|---|
| Headers | Matched case-insensitively after trimming. `Category`, `category`, and ` CATEGORY ` are the same column. |
| Extra columns | Ignored. A file exported from an accounting system carries plenty this import has no use for, and rejecting it would make the user edit their file for nothing. |
| `note` | Optional. |
| Amounts | Written the way a person writes them (`4800.00`), not in minor units. Parsed digit by digit, so `4800.10` stores exactly `480010`. Through a float it would be `480009`. |
| Negative amounts | Allowed. A refund is real. |
| Blank lines | Skipped, not reported as rows. |
| Byte order mark | Stripped, because Excel writes one. |

## Errors point at lines, not at rows

The header is line 1, so the first data row is line 2. Reporting an array index instead would send someone to the wrong line of their spreadsheet.

Every bad row is reported, not just the first, so a user fixing a file sees everything wrong with it in one pass rather than one problem per upload. Parse errors and unresolvable categories are found in separate passes and then **sorted by line**, because a user reads the list against their file top to bottom.

A structural problem is a `400` rather than a `422`: a missing column or an empty file has no row to attach an error to, and dressing it up as a row error would mislead.

## A failed import is still recorded

`status: FAILED` with the row errors attached. Without the record, a user whose upload was rejected has only the HTTP response, which they have already closed by the time they ask what went wrong.

The error list is truncated past a limit, because a file where every row is wrong would otherwise store a copy of itself in the record.

## Category names, not identifiers

A spreadsheet cell holds `Marketing`, not an ObjectId. Names resolve through `CategoriesService.resolveByName`, which matches on the normalised slug so capitalisation and spacing do not matter, and through a per-import cache keyed by name: a thousand-row file across forty categories is forty lookups, not a thousand.

An unresolvable name is a row error naming the line, not an exception, so a file naming three unknown categories reports all three at once.

### A spreadsheet is where invisible characters come from

Every cell goes through `sanitiseText` rather than being trimmed. A file exported as UTF-8 with a BOM carries one on its first value, and a name copied out of a web page routinely brings a no break space or a zero width space with it. `trim` removes none of those, because none of them is whitespace as far as it is concerned.

That mattered twice. A category cell holding nothing but invisible characters passed the "a category is required" check and then failed further down as an unknown category, pointing the reader at the wrong problem. And a note kept characters nobody could see, which came back out again through the CSV export.

A control character or a text direction override is refused rather than cleaned, as a row error naming its line and column, on the same reasoning as everywhere else: repairing one silently would hide the attempt. See [common/text](../../common/text/README.md).

## Limits, and what lies past them

| Limit | Value | Why |
|---|---|---|
| Rows | 10,000 | Every row is written in one transaction, and MongoDB holds a transaction's changes in memory until commit. |
| File size | 5 MB | The whole file is parsed in memory before anything is written, so its size is a memory bound on the process. |

Past those, the right answer is a queue and a background job, not a longer request. That is deliberately not built: this service has no broker at all, and adding one for the import alone would make it the only piece of infrastructure in the system. The README at the repo root states the row volume at which that trade changes.

The file size cap sits above the row cap on purpose, so an oversized file hits the row limit first and gets the clearer of the two messages.

## The lock check is one query

`assertAllUnlocked` takes every distinct month in the file and asks once. A year-spanning file would otherwise be twelve round trips before any write. A closed month anywhere refuses the whole file, which is the same fail-closed rule the row validation follows, and the error names the earliest closed month so it is deterministic.

`ExpensesService.createManyFromImport` deliberately skips the per-row lock check for this reason. The rule is not bypassed, only checked once instead of per row.

## How it relates to the rest of the project

The one module that composes others rather than owning a slice of the domain: it resolves through `@modules/categories`, gates on `@modules/period-locks`, writes through `@modules/expenses`, and records through `@modules/audit-log`. It exports nothing, because nothing else needs to import a file on another module's behalf.

The audit entry is written with `recordWithin` inside the import's transaction rather than through the dispatcher, so a rolled back import leaves no entry claiming it happened. It is written once for the batch, not once per row.

`csv-row.parser.ts` is deliberately pure: a buffer in, rows and errors out. Every parsing rule is testable without a database, an account, or a request.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/imports/expenses` | Upload a CSV. Requires `Idempotency-Key`. |
| `GET` | `/api/v1/imports` | List this account's imports, newest first. |
| `GET` | `/api/v1/imports/:batchId` | One import, with its row errors when it failed. |

To see what an import wrote: `GET /expenses?importBatchId=...`.

## Dependencies on other modules

`@modules/expenses`, `@modules/categories`, `@modules/period-locks`, `@modules/audit-log`, plus `@common/money` for amount parsing, `@common/month` for validation, `@common/database` for the transaction helper, and `@common/cache` for report invalidation.
