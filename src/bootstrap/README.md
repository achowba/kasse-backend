# bootstrap

Assembles the running application.

## What it does

Splits startup into two steps so each is testable and readable on its own:

1. `initialiseNestApplication` creates the app with its logs buffered, so lines emitted before the pino logger exists are replayed through it rather than written in a different format.
2. `bootstrapNestServer` applies everything global: security headers, the CORS allowlist, the `/api` prefix, URI versioning, the validation pipe, the exception filter, shutdown hooks, and the documentation UI.

`setupSwagger` mounts the dark themed docs at `/docs`, with a case insensitive filter plugin, and serves the OpenAPI document at `/docs-json`.

## How it relates to the rest of the project

`main.ts` calls these in order and then listens. Nothing else imports this folder.

Global concerns live here rather than in `AppModule` because they are properties of the running server, not of the dependency graph. Reading this folder tells you everything that applies to every request.

Two rules enforced here rather than per route: the validation pipe strips unknown properties and rejects a request carrying them, so nothing unvalidated reaches a service; and the exception filter is global, so no route can answer in a different error shape.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/docs` | Swagger UI. Not mounted in production or test. |
| `GET` | `/docs-json` | The OpenAPI document, which the web client generates its types from. |

## Dependencies on other modules

`@common/config` for the port, environment, and CORS allowlist. `@common/constants` for the route prefix. `@common/enums` for the version and environment. `@common/errors` for the global filter.
