# common/auth

The authentication primitives that both the auth module and every feature module need.

## What it does

Holds three things: the `IAuthenticatedUser` shape the JWT strategy attaches to a request, the `@CurrentUser` decorator that reads it, and the `@Public` decorator that exempts a route from authentication.

## Why these live here rather than in modules/auth

Every feature controller needs `@CurrentUser`, and `modules/auth` needs the users module. Putting the decorator in `modules/auth` would make every feature module import it and create a cycle. These are primitives with no dependencies, so they belong at the bottom of the graph with the rest of `common`.

The guard, the strategy, and the token issuing stay in `modules/auth`, because those have dependencies and behaviour.

## Two deliberate choices

**Authentication is on by default.** The guard is registered globally, so a newly added route is protected unless it opts out with `@Public`. The opposite arrangement, marking each protected route, means a forgotten decorator silently exposes data.

**`@CurrentUser` throws rather than returning undefined.** That only happens when a route is left unguarded by mistake, and a handler that receives `undefined` where it expects a user id would query across every account rather than one. Failing loudly is the safer outcome.

## Endpoints

None.

## Dependencies on other modules

None.
