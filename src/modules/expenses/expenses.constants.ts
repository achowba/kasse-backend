import { HttpStatus } from '@nestjs/common';
import { ErrorResponseDTO } from '@common/errors';

/**
 * Bounds on an expense amount, in minor units.
 *
 * @remarks
 * Negative is allowed, because a refund or a credit note is real spend in the
 * other direction. The bounds exist to reject corrupt input rather than to cap a
 * budget: beyond exact integer arithmetic an amount cannot be trusted.
 */
export const MIN_AMOUNT_MINOR = -Number.MAX_SAFE_INTEGER;
export const MAX_AMOUNT_MINOR = Number.MAX_SAFE_INTEGER;

/** Longest free text note accepted against an expense. */
export const NOTE_MAX_LENGTH = 280;

/**
 * The locked period response, documented on every mutating route.
 *
 * @remarks
 * Declared once because every write to an expense can hit a closed period, and
 * four copies of the same description would drift apart.
 */
export const LOCKED_RESPONSE = {
  status: HttpStatus.LOCKED,
  description: 'The month is closed. The response carries the month in `details`.',
  type: ErrorResponseDTO,
};
