# modules/health

Liveness and readiness probes.

## What it does

Two endpoints, because they answer different questions.

**Liveness** asks whether the process should be restarted. It checks nothing external on purpose: if it depended on the database, a database blip would restart every otherwise healthy instance and turn a degradation into an outage.

**Readiness** asks whether this instance should receive traffic, and may check its dependencies. It currently checks heap usage. The database indicator is added with the persistence layer, at which point the container healthcheck moves from a TCP connect to this endpoint.

## How it relates to the rest of the project

Imported by `AppModule`. Depends on nothing else in this project, so a failure elsewhere cannot stop the probes from answering, which is what makes them useful during an incident.

Both paths are excluded from request logging, because a probe every few seconds would otherwise dominate the logs.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/health` | Liveness. Checks no dependency. |
| `GET` | `/api/v1/health/ready` | Readiness. Checks heap, and later the database. |

## Dependencies on other modules

`@common/enums` for the API version. Terminus supplies the health indicators.
