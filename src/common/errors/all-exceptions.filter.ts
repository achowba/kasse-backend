import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppException } from './app.exception';
import { ErrorCodeEnum } from './error-code.enum';
import { IErrorResponse } from './error-response.interface';

/**
 * Describes a failure, before it is wrapped in the response envelope.
 *
 * @property status - HTTP status to answer with.
 * @property code - The stable code a client branches on.
 * @property message - Human readable description, safe to return.
 * @property details - Machine readable specifics, omitted when there are none.
 */
interface IDescribedFailure {
  status: number;
  code: ErrorCodeEnum;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Codes for framework raised {@link HttpException}s that carry no code of their own.
 */
const STATUS_TO_CODE: Partial<Record<number, ErrorCodeEnum>> = {
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
const GENERIC_SERVER_MESSAGE = 'An unexpected error occurred.';

/**
 * Lowest status treated as a failure the service owns.
 *
 * @remarks
 * A plain number rather than `HttpStatus.INTERNAL_SERVER_ERROR`, because
 * comparing a number against an enum member is an unsafe enum comparison: the
 * status here comes from `getStatus()`, which is typed as a number and is not
 * guaranteed to be an enum member.
 */
const SERVER_ERROR_THRESHOLD = 500;

/**
 * Turns every thrown value into the one error envelope this API returns.
 *
 * @remarks
 * Registered globally, so no route can answer in a different shape. A 5xx is
 * logged with its stack and answered with a generic message plus the request id:
 * the detail belongs in the log, not in the response. A 4xx is logged at `info`,
 * because a caller's mistake is not the service's error.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /**
   * Builds and sends the error response.
   *
   * @steps
   * 1. Classify the thrown value into a status, code, message, and details.
   * 2. Assemble the envelope, stamping it with the request id and path.
   * 3. Log it at the level its severity deserves.
   * 4. Send it.
   *
   * @param exception - Whatever was thrown. Not necessarily an `Error`.
   * @param host - The execution context, used to reach the request and response.
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request & { id?: string }>();
    const response = context.getResponse<Response>();

    const failure = this.describe(exception);

    const body: IErrorResponse = {
      statusCode: failure.status,
      code: failure.code,
      message: failure.status >= SERVER_ERROR_THRESHOLD ? GENERIC_SERVER_MESSAGE : failure.message,
      ...(failure.details === undefined ? {} : { details: failure.details }),
      requestId: this.resolveRequestId(request),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    this.record(exception, body, failure.message);

    response.status(failure.status).json(body);
  }

  /**
   * Classifies a thrown value.
   *
   * @remarks
   * Three cases. An {@link AppException} already knows its code and details. A
   * framework {@link HttpException} is mapped by status, and a validation
   * failure's field messages are lifted into `details.errors`. Anything else is
   * an unclassified internal error.
   *
   * @param exception - The thrown value.
   * @returns The status, code, message, and details describing it.
   */
  private describe(exception: unknown): IDescribedFailure {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        ...(exception.details === undefined ? {} : { details: exception.details }),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const fieldErrors = this.extractFieldErrors(payload);

      return {
        status,
        code: STATUS_TO_CODE[status] ?? ErrorCodeEnum.INTERNAL,
        message: exception.message,
        ...(fieldErrors === undefined ? {} : { details: { errors: fieldErrors } }),
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCodeEnum.INTERNAL,
      message: exception instanceof Error ? exception.message : 'Unknown error',
    };
  }

  /**
   * Lifts the per field messages out of a `ValidationPipe` failure.
   *
   * @remarks
   * The pipe puts every failing constraint in `message` as an array. Returning
   * them all at once means a caller fixes every field in one round trip instead
   * of discovering them one at a time.
   *
   * @param payload - The response body carried by the exception.
   * @returns The field messages, or undefined when the payload is not a validation failure.
   */
  private extractFieldErrors(payload: string | object): string[] | undefined {
    if (typeof payload !== 'object' || !('message' in payload)) {
      return undefined;
    }

    const { message } = payload;

    return Array.isArray(message) ? message.map((entry) => String(entry)) : undefined;
  }

  /**
   * Reads the request id set by the logger, falling back to the forwarded header.
   *
   * @param request - The incoming request.
   * @returns The request id, or an empty string when there is none.
   */
  private resolveRequestId(request: Request & { id?: string }): string {
    if (typeof request.id === 'string' && request.id.length > 0) {
      return request.id;
    }

    const header = request.headers['x-request-id'];

    return typeof header === 'string' ? header : '';
  }

  /**
   * Logs the failure before it is returned.
   *
   * @param exception - The thrown value, used for its stack.
   * @param body - The envelope about to be sent.
   * @param originalMessage - The real message, which a 5xx response replaces with a generic one.
   */
  private record(exception: unknown, body: IErrorResponse, originalMessage: string): void {
    const context = { requestId: body.requestId, path: body.path, code: body.code };

    if (body.statusCode >= SERVER_ERROR_THRESHOLD) {
      const stack = exception instanceof Error ? exception.stack : undefined;

      this.logger.error({ ...context, message: originalMessage }, stack);

      return;
    }

    this.logger.log({ ...context, message: originalMessage });
  }
}
