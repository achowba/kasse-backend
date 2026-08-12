/**
 * Machine readable error codes returned to clients.
 *
 * @remarks
 * A client branches on `code`, never on a substring of `message`. Messages are
 * written for people and may be reworded; these are the contract. Adding an
 * error means adding a member here, which keeps the set enumerable and
 * documentable in the OpenAPI document.
 *
 * @property VALIDATION_FAILED - The request body, query, or params failed validation.
 * @property UNAUTHENTICATED - No credentials, or credentials that are not valid.
 * @property FORBIDDEN - Authenticated, but not permitted to perform this action.
 * @property NOT_FOUND - No such record, or it is not owned by the caller.
 * @property CONFLICT - The write conflicts with a record that already exists.
 * @property IMPORT_VALIDATION_FAILED - A CSV upload was well formed but its rows were rejected.
 * @property PERIOD_LOCKED - The period is locked, so its plans and actuals are read only.
 * @property RATE_LIMITED - Too many requests from this caller.
 * @property INTERNAL - An unexpected failure. The response carries no internal detail.
 */
export enum ErrorCodeEnum {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  IMPORT_VALIDATION_FAILED = 'IMPORT_VALIDATION_FAILED',
  PERIOD_LOCKED = 'PERIOD_LOCKED',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL = 'INTERNAL',
}
