import { ErrorCodeEnum } from './error-code.enum';

/**
 * The single shape every error response takes.
 *
 * @remarks
 * Produced by the global exception filter, so a client parses any failure the
 * same way regardless of which layer raised it.
 *
 * @property statusCode - HTTP status, repeated in the body so a logged payload is self contained.
 * @property code - Stable code a client branches on, never a substring of the message.
 * @property message - Human readable description of what went wrong.
 * @property details - Machine readable specifics: the offending month, the failing rows, the invalid fields.
 * @property requestId - Correlates this response with its log lines and the `x-request-id` header.
 * @property path - The path that produced the error.
 * @property timestamp - When the error was produced, in ISO 8601.
 */
export interface IErrorResponse {
  statusCode: number;
  code: ErrorCodeEnum;
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
  path: string;
  timestamp: string;
}
