import { ApiProperty } from '@nestjs/swagger';
import { PeriodLockDocument } from '../schemas/period-lock.schema';

/**
 * A closed period.
 *
 * @property month - The closed month, as `YYYY-MM`.
 * @property lockedAt - When it was closed.
 */
export class PeriodLockResponseDTO {
  @ApiProperty({ description: 'The closed month.', example: '2026-01' })
  month!: string;

  @ApiProperty({ description: 'When it was closed.', example: '2026-02-01T09:00:00.000Z', format: 'date-time' })
  lockedAt!: string;

  /**
   * Maps a stored lock onto the response shape.
   *
   * @remarks
   * There is no identifier here on purpose. A lock is addressed by its month,
   * which is what a client already has, so exposing an id would invite a second
   * way to refer to the same thing.
   *
   * @param lock - The stored lock.
   * @returns The lock, as a client sees it.
   */
  static fromDocument(lock: PeriodLockDocument): PeriodLockResponseDTO {
    return { month: lock.month, lockedAt: lock.lockedAt.toISOString() };
  }
}
