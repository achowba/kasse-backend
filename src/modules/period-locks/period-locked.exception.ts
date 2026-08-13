import { HttpStatus } from '@nestjs/common';
import { AppException, ErrorCodeEnum } from '@common/errors';

/**
 * Raised when a write targets a locked month.
 *
 * @remarks
 * Answers `423 Locked` rather than `403`. The caller is permitted to edit their
 * own data in general; this particular period is closed, which is a state of the
 * resource rather than a property of the caller. A client can act on that: offer
 * to unlock, or explain why the field is read only.
 *
 * The month is carried in `details` so a client can name it without parsing the
 * message.
 */
export class PeriodLockedException extends AppException {
  /**
   * Creates the exception for a specific month.
   *
   * @param month - The locked month, as `YYYY-MM`.
   */
  constructor(month: string) {
    super(ErrorCodeEnum.PERIOD_LOCKED, `${month} is locked and cannot be edited.`, HttpStatus.LOCKED, { month });
  }
}
