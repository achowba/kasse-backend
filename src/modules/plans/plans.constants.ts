import { HttpStatus } from '@nestjs/common';
import { ErrorResponseDTO } from '@common/errors';

/**
 * Upper bound on a target, in minor units.
 *
 * @remarks
 * Beyond exact integer arithmetic an amount is corrupt input rather than a
 * budget, so this is a guard rather than a business limit. It is about 90
 * trillion in major units.
 */
export const MAX_TARGET_MINOR = Number.MAX_SAFE_INTEGER;

/**
 * The locked period response, documented on every mutating plan route.
 *
 * @remarks
 * Declared once because every write to a plan can hit a closed period, and three
 * copies of the same description would drift.
 */
export const LOCKED_RESPONSE = {
  status: HttpStatus.LOCKED,
  description: 'The month is closed. The response carries the month in `details`.',
  type: ErrorResponseDTO,
};
