# common/config

Environment validation and the typed application configuration.

## What it does

Validates the process environment once, at boot, and exposes it as a typed object. `validateEnvironment` runs during `ConfigModule` initialisation and throws with every problem listed at once, so a misconfiguration stops the process rather than surfacing at the first request that needs the missing value.

`appConfig` is the only code in the service that reads `process.env` for application settings. Everything else reads `IAppConfig` through `ConfigService`, so each default is defined in exactly one place.

## How it relates to the rest of the project

`AppModule` loads it globally. `src/bootstrap/` reads it to decide the port, the CORS allowlist, whether to mount documentation, and how to configure the logger.

Every variable is currently optional with a documented default, so the service boots on a clean checkout. A variable becomes required in the release that first depends on it.

## Endpoints

None.

## Dependencies on other modules

`@common/enums` for `NodeEnvEnum`, and `@common/constants` for the documented API version.
