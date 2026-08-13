# modules/users

Accounts and the settings reports are computed against.

## What it does

Stores an account: its login address, its password hash, its currency, and the month its fiscal year starts in. Exposes the two routes a user needs for their own account.

Credentials are not handled here. Hashing and verification belong to `modules/auth`, which owns that concern; this module stores and reads the hash it is given and never sees a password.

## Three decisions

**A user extends `AbstractDocument`, not `TenantOwnedDocument`.** A user is the tenant, so there is no owner above it. That is also why this module has its own repository rather than using `BaseTenantRepository`, which scopes every query to an owning user.

**The unique index on email is partial.** It applies only where `deletedAt` is null. Nothing here is hard deleted, so a plain unique index would reserve a deleted account's address forever.

**Changing the currency relabels rather than converts.** Amounts are minor units with no currency of their own. Converting them would need a rate and a date, which is a larger product decision than this exercise implies, so the API documents the behaviour instead of guessing.

## How it relates to the rest of the project

`modules/auth` uses `UsersService` to create an account at signup and to look one up at login. Reports read `currency` and `fiscalYearStartMonth` from here.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/me` | Read the signed in account. |
| `PATCH` | `/api/v1/me` | Change the currency or fiscal year start. |

Both act on the caller's own account, taken from the access token. No route takes a user id, so one account cannot address another.

Changing a password is **not** here. The hash lives in this collection and `updatePassword` writes it, but the route is `PATCH /auth/password` in [auth](../auth/README.md), because deciding whether a change is allowed means verifying the current password and revoking sessions, and both live there. Putting the route here would have made this module depend on auth, which already depends on this one.

## Dependencies on other modules

`@common/database` for the document base and the soft delete field. `@common/auth` for the `@CurrentUser` decorator. `@common/errors` for the documented error shape.
