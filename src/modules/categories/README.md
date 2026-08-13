# modules/categories

The categories a user plans and logs spend against.

## Two kinds

**The shared catalogue** has no owner: `userId` is null. Every account can select from it, no account can change it. Forty entries covering people, go to market, technology, facilities, professional services, and finance.

**A user's own categories** sit alongside it and are theirs to rename, archive, or delete.

## Why shared rather than copied per account

Copying forty rows into every account at signup would make the catalogue impossible to correct: renaming one entry would leave every existing account with the old name, and there would be no way to tell a stale copy from a deliberate rename. One shared row read by everyone has neither problem.

The cost is that this module cannot use `BaseTenantRepository`, which requires an owner on every row. It has its own repository where the scope is "mine or shared" for reads and "mine" for writes, applied through two private helpers so the rule lives in one place.

## Uniqueness is on a normalised key

`Cloud Hosting`, `cloud hosting`, and `Cloud  Hosting` are the same category. Names are compared on a slug: lower case, trimmed, runs of non alphanumeric characters collapsed to a hyphen. The displayed name keeps whatever capitalisation the user chose.

Without this a picker shows what looks like the same category twice and a variance report splits the same spend across both, which is the kind of wrong number nobody notices until it matters.

The unique index is partial on `deletedAt`, so a deleted name becomes available again. A plain unique index would reserve it forever, since nothing here is hard deleted.

## Archive and delete are different things

Archiving hides a category from pickers and changes nothing else: existing plans and actuals still resolve it, and reports are unaffected. It is almost always what someone wants.

Deleting is a soft delete. The record survives so a locked period keeps resolving the name it referenced and a mistake is recoverable. Both are recorded in the audit log with the state before the change.

## Seeding

The catalogue is seeded at boot when it is missing, so a fresh database is never empty and there is no setup step to forget. It is idempotent twice: it skips when the catalogue is already there, and the unique index turns a concurrent seed from a second instance into a duplicate key error rather than duplicate rows.

## How it relates to the rest of the project

Plans and actuals reference a category and check the caller may use it. The CSV import resolves a name from a spreadsheet cell through `resolveByName`, which matches on the slug so capitalisation and spacing in the file do not matter. Where an account has its own category with the same name as a shared one, the account's own wins.

Every change is recorded through `@modules/audit-log`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/categories` | List the caller's categories plus the shared catalogue. |
| `POST` | `/api/v1/categories` | Create a category owned by the caller. |
| `PATCH` | `/api/v1/categories/:categoryId` | Rename or archive one the caller owns. |
| `DELETE` | `/api/v1/categories/:categoryId` | Soft delete one the caller owns. |

A shared catalogue entry answers `404` on the mutating routes rather than `403`, because a client already knows from the `shared` flag and there is nothing useful to reveal.

## Dependencies on other modules

`@modules/audit-log` to record changes. `@common/pagination` for the list shape, `@common/pipes` for identifier parsing, `@common/auth` for the caller, `@common/request-context` for the request id on the audit entry.
