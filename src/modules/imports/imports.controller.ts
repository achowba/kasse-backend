import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  ParseFilePipeBuilder,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Types } from 'mongoose';
import { CurrentUser, type IAuthenticatedUser } from '@common/auth';
import { ApiVersionEnum } from '@common/enums';
import { ErrorResponseDTO } from '@common/errors';
import { IPaginatedResponse, PaginationQueryDTO } from '@common/pagination';
import { ParseObjectIdPipe } from '@common/pipes';
import { RequestId } from '@common/request-context';
import { LOCKED_RESPONSE } from '@modules/expenses';
import { ImportBatchResponseDTO } from './dto/import-batch-response.dto';
import { IDEMPOTENCY_KEY_HEADER, MAX_FILE_BYTES, MAX_ROWS } from './imports.constants';
import { ImportsService } from './imports.service';
import type { IUploadedFile } from './uploaded-file.interface';

/**
 * Bulk import of expenses from a CSV file.
 */
@ApiTags('Imports')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'The access token is missing, expired, or invalid.', type: ErrorResponseDTO })
@Controller({ path: 'imports', version: ApiVersionEnum.V1 })
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  /**
   * Imports a CSV of expenses.
   *
   * @param user - The authenticated caller.
   * @param idempotencyKey - The client's key for this upload.
   * @param file - The uploaded file.
   * @param requestId - The request making the change.
   * @returns The batch, whether it succeeded or failed.
   */
  @Post('expenses')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiHeader({
    name: IDEMPOTENCY_KEY_HEADER,
    required: true,
    description:
      'A key the client generates for this upload, such as a UUID. Sending the same key again returns the original result instead of importing a second time.',
    example: '5f2a4c6e-9b1d-4d3a-8f7c-2e1b0a9d8c7b',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary', description: 'A CSV file.' } },
    },
  })
  @ApiOperation({
    summary: 'Import expenses from a CSV',
    description: `Reads a CSV of expenses and writes them all, or writes none of them.

**Columns.** \`category\`, \`month\`, and \`amount\` are required; \`note\` is optional. Header matching ignores case and surrounding spaces, and extra columns are ignored rather than rejected, because a file exported from an accounting system carries plenty this import has no use for.

\`\`\`csv
category,month,amount,note
Marketing,2026-01,4800.00,Q1 campaign
Payroll,2026-01,20500.00
\`\`\`

**Amounts** are written the way a person writes them, not in minor units. They are parsed digit by digit rather than through floating point, so \`4800.10\` stores exactly 480010 and never 480009.

**Fail closed.** Every row is validated, every category resolved, and every month checked against the period locks before anything is written. If one row is wrong, nothing is written and the response lists every problem with its line number. This matters more than it sounds: an import that wrote the good rows and stopped could not simply be re-uploaded after a fix, because that would double the rows that did land.

**Idempotent.** \`${IDEMPOTENCY_KEY_HEADER}\` is required. Sending the same key again returns the original batch without importing anything, so a client that retries after a timeout does not double a month's spend.

**Limits.** ${MAX_ROWS.toLocaleString('en-US')} rows and ${MAX_FILE_BYTES / (1024 * 1024)} MB. Past that the right answer is a background job rather than a longer request.`,
  })
  @ApiCreatedResponse({ description: 'The import committed.', type: ImportBatchResponseDTO })
  @ApiBadRequestResponse({
    description: 'The file is missing a required column, has no rows, is too large, or is not readable as CSV.',
    type: ErrorResponseDTO,
  })
  @ApiUnprocessableEntityResponse({
    description: 'At least one row was rejected. Nothing was written. `details.errors` carries the line numbers.',
    type: ErrorResponseDTO,
  })
  @ApiResponse(LOCKED_RESPONSE)
  async importExpenses(
    @CurrentUser() user: IAuthenticatedUser,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @UploadedFile(new ParseFilePipeBuilder().addMaxSizeValidator({ maxSize: MAX_FILE_BYTES }).build({ fileIsRequired: true }))
    file: IUploadedFile,
    @RequestId() requestId?: string,
  ): Promise<ImportBatchResponseDTO> {
    if (idempotencyKey === undefined || idempotencyKey.trim() === '') {
      // Required rather than generated for the client. A key the server invents
      // is different on every retry, which is the one thing it must not be.
      throw new BadRequestException(`${IDEMPOTENCY_KEY_HEADER} is required, so a retry cannot import the file twice.`);
    }

    return await this.importsService.importExpenses(
      user.userId,
      idempotencyKey.trim(),
      file.originalname,
      file.buffer,
      requestId,
    );
  }

  /**
   * Lists the caller's imports.
   *
   * @param user - The authenticated caller.
   * @param query - Pagination.
   * @returns The batches, newest first.
   */
  @Get()
  @ApiOperation({
    summary: 'List imports',
    description: `Every import this account has attempted, newest first, successful or not.

A failed import is kept deliberately. Without the record, a user whose upload was rejected has only the HTTP response, which they have already closed by the time they ask what went wrong.`,
  })
  @ApiOkResponse({ description: 'A page of imports.', type: [ImportBatchResponseDTO] })
  async list(
    @CurrentUser() user: IAuthenticatedUser,
    @Query() query: PaginationQueryDTO,
  ): Promise<IPaginatedResponse<ImportBatchResponseDTO>> {
    return await this.importsService.list(user.userId, query);
  }

  /**
   * Reads one import.
   *
   * @param user - The authenticated caller.
   * @param batchId - The import to read.
   * @returns The batch.
   */
  @Get(':batchId')
  @ApiParam({ name: 'batchId', description: 'Identifier from the import list.', example: '65f1c2d3e4b5a6c7d8e9f0d1' })
  @ApiOperation({
    summary: 'Read one import',
    description: `The outcome of a single import, including the per row errors when it failed.

To see what a successful import actually wrote, list expenses filtered by this batch: \`GET /expenses?importBatchId=...\`.`,
  })
  @ApiOkResponse({ description: 'The import.', type: ImportBatchResponseDTO })
  @ApiNotFoundResponse({ description: 'The caller has no import with that id.', type: ErrorResponseDTO })
  async getById(
    @CurrentUser() user: IAuthenticatedUser,
    @Param('batchId', ParseObjectIdPipe) batchId: Types.ObjectId,
  ): Promise<ImportBatchResponseDTO> {
    return await this.importsService.getById(user.userId, batchId);
  }
}
