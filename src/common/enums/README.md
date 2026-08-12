# common/enums

Enumerations shared across features.

## What it does

`NodeEnvEnum` names the runtime environments. Behaviour keyed off it: documentation is not mounted in production, logs are pretty printed only in development, and CORS is permissive in development and test but strict everywhere else.

`ApiVersionEnum` names the API versions exposed through URI versioning. A breaking change to a response adds a member; it never mutates an existing version in place.

## How it relates to the rest of the project

`@common/config` types the environment against `NodeEnvEnum`, so an unrecognised value fails validation at boot instead of silently falling through to production behaviour. Controllers declare their version with `ApiVersionEnum`.

## Endpoints

None.

## Dependencies on other modules

None.
