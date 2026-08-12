import { HttpStatus } from '@nestjs/common';
import { ErrorCodeEnum } from './error-code.enum';

/**
 * Codes for framework raised exceptions that carry no code of their own.
 *
 * @remarks
 * A status Nest raises on its own, such as a 404 from an unmatched route, still
 * has to reach a client in the documented envelope. This is the mapping that
 * makes that possible without every layer having to raise a typed exception.
 */
export const STATUS_TO_CODE: Partial<Record<number, ErrorCodeEnum>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCodeEnum.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ErrorCodeEnum.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ErrorCodeEnum.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCodeEnum.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCodeEnum.CONFLICT,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCodeEnum.IMPORT_VALIDATION_FAILED,
  [HttpStatus.LOCKED]: ErrorCodeEnum.PERIOD_LOCKED,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCodeEnum.RATE_LIMITED,
};

/** Returned for any 5xx, so no internal detail reaches a client. */
export const GENERIC_SERVER_MESSAGE = 'An unexpected error occurred.';

/**
 * Lowest status treated as a failure the service owns.
 *
 * @remarks
 * A plain number rather than `HttpStatus.INTERNAL_SERVER_ERROR`, because the
 * status being compared comes from `getStatus()`, which is typed as a number and
 * is not guaranteed to be an enum member. Comparing the two is an unsafe enum
 * comparison.
 */
export const SERVER_ERROR_THRESHOLD = 500;
