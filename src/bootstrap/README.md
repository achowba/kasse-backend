# bootstrap

Assembles the running application.

## What it does

Splits startup into two steps so each is testable and readable on its own:

1. `initialiseNestApplication` creates the app with its logs buffered, so lines emitted before the pino logger exists are replayed through it rather than written in a different format.
2. `bootstrapNestServer` applies everything global: security headers, the CORS allowlist, the `/api` prefix, URI versioning, the validation pipe, the exception filter, shutdown hooks, and the documentation UI.

`setupSwagger` mounts the dark themed docs at `/docs`, with a case insensitive filter plugin, and serves the OpenAPI document at `/docs-json`.

## The boot line names an address it can actually reach

`main.ts` logs where the service is listening, because "Nest application successfully started" does not say where and a reader should not have to guess at a port they may have overridden.

It used to build that address as `http://localhost:${port}` unconditionally. On a developer's machine that is right. In a container it announced a URL that resolves to the container itself, which nobody can reach and which is not where the service answers. **Naming the wrong address is worse than naming none**, because it is the first thing somebody copies when a deployment looks wrong.

A process behind a proxy cannot discover its own public address: the proxy terminates TLS and rewrites the host. So it has to be told, through `PUBLIC_URL`. Reading a platform's own variable instead would tie this service to one host.

`resolveBaseUrl` decides, in order:

| Condition | Result |
|---|---|
| `PUBLIC_URL` is set | That, with any trailing slash removed |
| Development or test | `http://localhost:PORT`, which is true there |
| Anything else | `null` |

On `null` the caller logs the port and the paths on their own, which are true everywhere. The port is always accurate, so it carries the message when the host cannot.

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
