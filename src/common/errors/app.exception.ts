import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodeEnum } from './error-code.enum';

/**
 * Base for every exception this service raises deliberately.
 *
 * @remarks
 * Carries the machine readable code and optional structured details alongside
 * the HTTP status, so the global filter builds the error envelope without
 * inferring anything. A service throws a subclass of this rather than a bare
 * `Error`, which would reach the filter unclassified and become a 500.
 */
export class AppException extends HttpException {
  /**
   * Creates a classified application exception.
   *
   * @param code - The stable code a client branches on.
   * @param message - Human readable description of what went wrong.
   * @param status - HTTP status to answer with.
   * @param details - Machine readable specifics, such as the offending month.
   */
  constructor(
    public readonly code: ErrorCodeEnum,
    message: string,
    status: HttpStatus,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message, status);
  }
}
