import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { PaginationQueryDTO } from '@common/pagination';
import { AuditActionEnum, AuditEntityEnum } from '../audit-log.enums';

/**
 * Filters for reading the audit trail.
 *
 * @remarks
 * Extends the shared pagination query, so the trail is paged like every other
 * list and cannot be read unbounded.
 *
 * @property entity - Restrict to one kind of record.
 * @property action - Restrict to one kind of change.
 * @property entityId - Restrict to the history of a single record.
 */
export class ListAuditEntriesQueryDTO extends PaginationQueryDTO {
  @ApiPropertyOptional({ description: 'Restrict to one kind of record.', enum: AuditEntityEnum })
  @IsOptional()
  @IsEnum(AuditEntityEnum)
  entity?: AuditEntityEnum;

  @ApiPropertyOptional({ description: 'Restrict to one kind of change.', enum: AuditActionEnum })
  @IsOptional()
  @IsEnum(AuditActionEnum)
  action?: AuditActionEnum;

  @ApiPropertyOptional({
    description: 'Restrict to the history of a single record.',
    example: '65f1c2d3e4b5a6c7d8e9f0a2',
  })
  @IsOptional()
  @IsMongoId()
  entityId?: string;
}
