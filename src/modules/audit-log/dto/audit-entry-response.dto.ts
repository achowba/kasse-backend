import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditActionEnum, AuditEntityEnum } from '../audit-log.enums';
import { AuditEntryDocument } from '../schemas/audit-entry.schema';

/**
 * One recorded change, as returned to the account it belongs to.
 *
 * @property id - Identifier of the entry.
 * @property action - What happened.
 * @property entity - What kind of record it happened to.
 * @property entityId - Which record, where there is a single subject.
 * @property before - State before the change. Absent on a creation.
 * @property after - State after the change. Absent on a deletion.
 * @property requestId - The request that made the change, matching the logs and the error envelope.
 * @property at - When it happened.
 */
export class AuditEntryResponseDTO {
  @ApiProperty({ description: 'Identifier of the entry.', example: '65f1c2d3e4b5a6c7d8e9f0a1' })
  id!: string;

  @ApiProperty({ description: 'What happened.', enum: AuditActionEnum, example: AuditActionEnum.PLAN_UPDATED })
  action!: AuditActionEnum;

  @ApiProperty({ description: 'What kind of record it happened to.', enum: AuditEntityEnum, example: AuditEntityEnum.PLAN })
  entity!: AuditEntityEnum;

  @ApiPropertyOptional({ description: 'Which record.', example: '65f1c2d3e4b5a6c7d8e9f0a2', nullable: true })
  entityId!: string | null;

  @ApiPropertyOptional({
    description: 'State before the change. Null on a creation.',
    example: { targetMinor: 500000 },
    nullable: true,
  })
  before!: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: 'State after the change. Null on a deletion.',
    example: { targetMinor: 600000 },
    nullable: true,
  })
  after!: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: 'The request that made the change. Matches the x-request-id header and the log lines.',
    example: '0f9c1e2a-7b3d-4c5e-9a8f-1b2c3d4e5f6a',
    nullable: true,
  })
  requestId!: string | null;

  @ApiProperty({ description: 'When it happened.', example: '2026-01-15T10:04:11.212Z', format: 'date-time' })
  at!: string;

  /**
   * Maps a stored entry onto the response shape.
   *
   * @param entry - The stored audit entry.
   * @returns The entry, as a client sees it.
   */
  static fromDocument(entry: AuditEntryDocument): AuditEntryResponseDTO {
    return {
      id: entry._id.toString(),
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId === null ? null : entry.entityId.toString(),
      before: entry.before,
      after: entry.after,
      requestId: entry.requestId,
      at: entry.at.toISOString(),
    };
  }
}
