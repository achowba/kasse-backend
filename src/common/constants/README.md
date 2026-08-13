# common/constants

Values shared across features.

## What it does

Holds the constants more than one feature needs: the global route prefix, the version reported in the OpenAPI document, and the default and maximum page sizes for list endpoints.

`API_DOC_VERSION` is deliberately separate from the version in `package.json`. It describes the API contract, so a release that changes no route does not change it.

## How it relates to the rest of the project

`src/bootstrap/` applies `API_PREFIX`. Pagination DTOs will read the page size limits, so a cap exists in one place rather than being repeated per endpoint.

A value used by exactly one module belongs in that module, not here.

## Endpoints

None.

## Dependencies on other modules

None.
