/**
 * Global route prefix applied to every controller.
 *
 * @remarks
 * Combined with URI versioning this produces `/api/v1/...`.
 */
export const API_PREFIX = 'api';

/**
 * Version reported in the OpenAPI document.
 *
 * @remarks
 * This is the version of the documented API contract, which is deliberately
 * separate from the package version in `package.json`. A release that changes
 * no route does not change this.
 */
export const API_DOC_VERSION = '1.0.0';

/**
 * Default number of records returned by a list endpoint.
 */
export const DEFAULT_PAGE_LIMIT = 50;

/**
 * Hard cap on a page size, so a client cannot request an unbounded read.
 */
export const MAX_PAGE_LIMIT = 200;
