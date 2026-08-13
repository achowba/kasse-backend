import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCodeEnum } from './error-code.enum';

/**
 * The error envelope, described for the API documentation.
 *
 * @remarks
 * Mirrors `IErrorResponse`. The interface types the code; this class carries the
 * Swagger metadata, so every documented failure response points at one shape
 * rather than each route describing its own.
 *
 * @property statusCode - HTTP status, repeated in the body so a logged payload is self contained.
 * @property code - Stable code a client branches on. Never parse the message.
 * @property message - Human readable description of what went wrong.
 * @property details - Machine readable specifics, present only when there are any.
 * @property requestId - Correlates this response with its log lines and the `x-request-id` header.
 * @property path - The path that produced the error.
 * @property timestamp - When the error was produced.
 */
export class ErrorResponseDTO {
  @ApiProperty({ description: 'HTTP status, repeated in the body.', example: 423 })
  statusCode!: number;

  @ApiProperty({
    description: 'Stable code a client branches on. Never parse the message.',
    enum: ErrorCodeEnum,
    example: ErrorCodeEnum.PERIOD_LOCKED,
  })
  code!: ErrorCodeEnum;

  @ApiProperty({ description: 'What went wrong, written for a person.', example: '2026-01 is locked and cannot be edited.' })
  message!: string;

  @ApiPropertyOptional({
    description: 'Machine readable specifics: the offending month, the failing rows, the invalid fields.',
    example: { month: '2026-01' },
  })
  details?: Record<string, unknown>;

  @ApiProperty({
    description: 'Correlates this response with its log lines and the x-request-id header.',
    example: '0f9c1e2a-7b3d-4c5e-9a8f-1b2c3d4e5f6a',
  })
  requestId!: string;

  @ApiProperty({ description: 'The path that produced the error.', example: '/api/v1/plans' })
  path!: string;

  @ApiProperty({ description: 'When the error was produced.', example: '2026-01-15T10:04:11.212Z', format: 'date-time' })
  timestamp!: string;
}
