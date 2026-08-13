import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CurrentUser, type IAuthenticatedUser } from '@common/auth';
import { ApiVersionEnum } from '@common/enums';
import { ErrorResponseDTO } from '@common/errors';
import { IPaginatedResponse } from '@common/pagination';
import { AuditLogService } from './audit-log.service';
import { AuditEntryResponseDTO } from './dto/audit-entry-response.dto';
import { ListAuditEntriesQueryDTO } from './dto/list-audit-entries.query.dto';

/**
 * The trail of changes to financial data.
 *
 * @remarks
 * Read only by design. There is no route that writes or edits an entry: entries
 * are written by the services that make the changes, in the same transaction.
 */
@ApiTags('Audit log')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'The access token is missing, expired, or invalid.', type: ErrorResponseDTO })
@Controller({ path: 'audit-log', version: ApiVersionEnum.V1 })
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  /**
   * Reads a page of the caller's audit trail.
   *
   * @param user - The authenticated caller.
   * @param query - Filters and pagination.
   * @returns The entries, newest first.
   */
  @Get()
  @ApiOperation({
    summary: 'Read the audit trail',
    description: `Returns changes to this account's financial data, newest first.

Every change to a plan, an expense, a category, or a period lock is recorded with the state before and after, so the trail answers what changed rather than only what the record says now. Because deletes are soft and audited, a deleted record's last known state is still readable here.

Each entry carries the \`requestId\` of the request that made the change, which matches the \`x-request-id\` response header and the service logs for the same request.

Filter by \`entity\` and \`entityId\` to read the history of one record.

The trail is append only. No route in this API can edit or remove an entry.`,
  })
  @ApiOkResponse({ description: 'A page of the audit trail.', type: [AuditEntryResponseDTO] })
  async list(
    @CurrentUser() user: IAuthenticatedUser,
    @Query() query: ListAuditEntriesQueryDTO,
  ): Promise<IPaginatedResponse<AuditEntryResponseDTO>> {
    return await this.auditLogService.list(user.userId, query);
  }
}
