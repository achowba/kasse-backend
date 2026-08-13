# common

Platform and domain primitives with no knowledge of any feature.

## What it does

Holds the pieces every feature depends on: configuration, logging, the error envelope, shared constants, and shared enums. Later work adds month arithmetic, money arithmetic, pagination shapes, and the tenant scoped repository base here.

## How it relates to the rest of the project

Everything depends on `common`. `common` depends on nothing in `src/modules/`. That direction is the point: a primitive that reaches back into a feature stops being a primitive, and the import creates a cycle.

`src/bootstrap/` consumes the configuration, the error filter, and the constants to assemble the running application.

## Contents

| Folder | Holds |
|---|---|
| `config/` | Environment validation and the typed application configuration. |
| `constants/` | Values shared across features, such as the route prefix and page size limits. |
| `enums/` | Enumerations shared across features, such as the runtime environment. |
| `errors/` | Error codes, the base exception, and the global exception filter. |
| `logging/` | Logger configuration, including redaction. |

## Dependencies on other modules

None. This folder is the bottom of the dependency graph.
