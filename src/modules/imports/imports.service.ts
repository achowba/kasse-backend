import { BadRequestException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { DataVersionService } from '@common/cache';
import { DUPLICATE_KEY_ERROR, withTransaction } from '@common/database';
import { AppException, ErrorCodeEnum } from '@common/errors';
import { IPaginatedResponse, PaginationQueryDTO, toPaginatedResponse } from '@common/pagination';
import { AuditActionEnum, AuditEntityEnum, AuditLogService } from '@modules/audit-log';
import { CategoriesService } from '@modules/categories';
import { ExpensesService } from '@modules/expenses';
import { PeriodLocksService } from '@modules/period-locks';
import { IParsedRow, parseExpenseCsv } from './csv-row.parser';
import { ImportBatchResponseDTO } from './dto/import-batch-response.dto';
import { MAX_REPORTED_ERRORS } from './imports.constants';
import { ImportStatusEnum } from './imports.enums';
import { ImportsRepository } from './imports.repository';
import { IImportRowError, ImportBatchDocument } from './schemas/import-batch.schema';

/**
 * One row, with its category resolved to an identifier.
 *
 * @property categoryId - The resolved category.
 * @property month - The month it belongs to.
 * @property amountMinor - The amount, in minor units.
 * @property note - The optional note.
 */
interface IResolvedRow {
  categoryId: Types.ObjectId;
  month: string;
  amountMinor: number;
  note: string | null;
}

/**
 * Bulk import of expenses from a CSV file.
 *
 * @remarks
 * **Fail closed.** The file is parsed, every row validated, every category
 * resolved, and every month checked against the period locks before a single
 * expense is written. Then all of them are written in one transaction. A file
 * either lands whole or not at all, so a user never has to work out which half of
 * their upload succeeded.
 *
 * That ordering is the whole design. The tempting alternative, writing rows as
 * they validate, is faster and leaves a partial import behind on the first bad
 * row, which is the worst outcome: the file cannot simply be re-uploaded, because
 * doing so would double the rows that did land.
 *
 * **Idempotent.** A repeat of the same `Idempotency-Key` returns the original
 * batch rather than importing again. A network timeout on a large upload is the
 * common case, and without this a nervous retry doubles a month's spend.
 */
@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly importsRepository: ImportsRepository,
    private readonly expensesService: ExpensesService,
    private readonly categoriesService: CategoriesService,
    private readonly periodLocksService: PeriodLocksService,
    private readonly auditLogService: AuditLogService,
    private readonly dataVersionService: DataVersionService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * Imports a CSV of expenses.
   *
   * @steps
   * 1. Return the earlier batch when this key has already been used, without
   *    reading the file at all.
   * 2. Parse and validate every row. A malformed file is rejected here, before
   *    any database work.
   * 3. Resolve every category name to an identifier the account can use,
   *    collecting a per row error for each that does not resolve.
   * 4. Check every month in the file against the period locks, in one query.
   * 5. Record the failure and stop when anything is wrong, writing no expenses.
   * 6. Otherwise write every row and the batch in one transaction.
   *
   * @param userId - The authenticated caller.
   * @param idempotencyKey - The client's key for this upload.
   * @param filename - The uploaded file's name.
   * @param file - The uploaded file's bytes.
   * @param requestId - The request making the change.
   * @returns The batch, whether it succeeded or failed.
   * @throws AppException With `IMPORT_VALIDATION_FAILED` when any row is rejected.
   * @throws PeriodLockedException When any month in the file is closed.
   * @throws BadRequestException When the file is not usable as a whole.
   */
  async importExpenses(
    userId: Types.ObjectId,
    idempotencyKey: string,
    filename: string,
    file: Buffer,
    requestId?: string,
  ): Promise<ImportBatchResponseDTO> {
    const replayed = await this.importsRepository.findByIdempotencyKey(userId, idempotencyKey);

    if (replayed !== null) {
      this.logger.log({ userId: userId.toString(), idempotencyKey }, 'import replayed, returning the original batch');

      return ImportBatchResponseDTO.fromDocument(replayed);
    }

    const parsed = this.parseOrReject(file);
    const { resolved, errors } = await this.resolveCategories(userId, parsed.rows, parsed.errors);

    if (errors.length > 0) {
      const failed = await this.recordFailure(userId, idempotencyKey, filename, parsed.rowCount, errors);

      throw new AppException(
        ErrorCodeEnum.IMPORT_VALIDATION_FAILED,
        `The file was rejected. ${errors.length} of ${parsed.rowCount} rows could not be imported, and nothing was written.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { batchId: failed.id, errors: failed.errors },
      );
    }

    // One query for every month in the file rather than one per row. A closed
    // month anywhere means the whole file is refused, which is the same fail
    // closed rule the row validation follows.
    await this.periodLocksService.assertAllUnlocked(
      userId,
      resolved.map((row: IResolvedRow) => row.month),
    );

    return await this.writeBatch(userId, idempotencyKey, filename, parsed.rowCount, resolved, requestId);
  }

  /**
   * Lists an account's imports, newest first.
   *
   * @param userId - The authenticated caller.
   * @param query - Pagination.
   * @returns The batches.
   */
  async list(userId: Types.ObjectId, query: PaginationQueryDTO): Promise<IPaginatedResponse<ImportBatchResponseDTO>> {
    const { batches, total } = await this.importsRepository.list(userId, query.limit, query.offset);

    return toPaginatedResponse(
      batches.map((batch: ImportBatchDocument) => ImportBatchResponseDTO.fromDocument(batch)),
      total,
      query,
    );
  }

  /**
   * Reads one import.
   *
   * @param userId - The authenticated caller.
   * @param batchId - The batch to read.
   * @returns The batch.
   * @throws AppException With `NOT_FOUND` when the caller has no such batch.
   */
  async getById(userId: Types.ObjectId, batchId: Types.ObjectId): Promise<ImportBatchResponseDTO> {
    const batch = await this.importsRepository.findById(userId, batchId);

    if (batch === null) {
      throw new AppException(ErrorCodeEnum.NOT_FOUND, 'Import not found.', HttpStatus.NOT_FOUND);
    }

    return ImportBatchResponseDTO.fromDocument(batch);
  }

  /**
   * Parses the file, turning a structural problem into a 400.
   *
   * @remarks
   * A missing column or an unparseable file is not a per row error: there are no
   * rows to attach it to, and reporting it as one would be misleading.
   *
   * @param file - The uploaded bytes.
   * @returns The parse result.
   * @throws BadRequestException When the file cannot be used at all.
   */
  private parseOrReject(file: Buffer): ReturnType<typeof parseExpenseCsv> {
    try {
      return parseExpenseCsv(file);
    } catch (error: unknown) {
      throw new BadRequestException(error instanceof Error ? error.message : 'The file could not be read as CSV.');
    }
  }

  /**
   * Resolves each row's category name to an identifier.
   *
   * @remarks
   * Names are resolved through a small cache keyed by the name as written. A file
   * of a thousand rows across forty categories would otherwise be a thousand
   * lookups for forty answers.
   *
   * A name that does not resolve becomes a per row error rather than an
   * exception, so a file naming three unknown categories reports all three.
   *
   * @param userId - The authenticated caller.
   * @param rows - The rows that parsed.
   * @param parseErrors - Errors already found while parsing.
   * @returns The resolved rows and every error, in file order.
   */
  private async resolveCategories(
    userId: Types.ObjectId,
    rows: IParsedRow[],
    parseErrors: IImportRowError[],
  ): Promise<{ resolved: IResolvedRow[]; errors: IImportRowError[] }> {
    const seen = new Map<string, Types.ObjectId | null>();
    const resolved: IResolvedRow[] = [];
    const errors = [...parseErrors];

    for (const row of rows) {
      const key = row.categoryName.toLowerCase();

      if (!seen.has(key)) {
        const category = await this.categoriesService.resolveByName(userId, row.categoryName);

        seen.set(key, category?._id ?? null);
      }

      const categoryId = seen.get(key) ?? null;

      if (categoryId === null) {
        errors.push({
          line: row.line,
          column: 'category',
          message: `"${row.categoryName}" is not a category on this account. Create it first, or correct the spelling.`,
        });

        continue;
      }

      resolved.push({ categoryId, month: row.month, amountMinor: row.amountMinor, note: row.note });
    }

    errors.sort((first: IImportRowError, second: IImportRowError) => first.line - second.line);

    return { resolved, errors };
  }

  /**
   * Records a rejected file.
   *
   * @remarks
   * Written outside a transaction and kept. Without it, a user whose upload
   * failed has only the HTTP response, which they have already closed by the time
   * they ask what went wrong.
   *
   * The error list is truncated, because a file where every row is wrong would
   * otherwise store a copy of the whole file in the record.
   *
   * @param userId - The authenticated caller.
   * @param idempotencyKey - The client's key.
   * @param filename - The uploaded file's name.
   * @param rowCount - How many data rows it carried.
   * @param errors - Every rejected row.
   * @returns The recorded batch.
   */
  private async recordFailure(
    userId: Types.ObjectId,
    idempotencyKey: string,
    filename: string,
    rowCount: number,
    errors: IImportRowError[],
  ): Promise<ImportBatchResponseDTO> {
    const batch = await this.importsRepository.record(userId, {
      idempotencyKey,
      filename,
      status: ImportStatusEnum.FAILED,
      rowCount,
      errorCount: errors.length,
      rowErrors: errors.slice(0, MAX_REPORTED_ERRORS),
      expenseCount: 0,
    });

    this.logger.log({ userId: userId.toString(), rowCount, errorCount: errors.length }, 'import rejected, nothing written');

    return ImportBatchResponseDTO.fromDocument(batch);
  }

  /**
   * Writes every row and the batch together.
   *
   * @remarks
   * One transaction. Either every expense and the batch that describes them
   * commit, or none of it does, so there is no state where the rows exist without
   * a record of where they came from.
   *
   * A duplicate key here means another request used the same idempotency key
   * while this one was working. The transaction is already rolled back at that
   * point, so the correct answer is the batch that other request wrote.
   *
   * @param userId - The authenticated caller.
   * @param idempotencyKey - The client's key.
   * @param filename - The uploaded file's name.
   * @param rowCount - How many data rows it carried.
   * @param rows - The resolved rows.
   * @param requestId - The request making the change.
   * @returns The committed batch.
   */
  private async writeBatch(
    userId: Types.ObjectId,
    idempotencyKey: string,
    filename: string,
    rowCount: number,
    rows: IResolvedRow[],
    requestId?: string,
  ): Promise<ImportBatchResponseDTO> {
    try {
      const batch = await withTransaction(this.connection, async (session: ClientSession): Promise<ImportBatchDocument> => {
        const created = await this.importsRepository.record(
          userId,
          {
            idempotencyKey,
            filename,
            status: ImportStatusEnum.COMPLETED,
            rowCount,
            errorCount: 0,
            rowErrors: [],
            expenseCount: rows.length,
          },
          session,
        );

        await this.expensesService.createManyFromImport(userId, rows, created._id, session);

        // Inside the transaction, so a rollback leaves no entry claiming an
        // import happened.
        await this.auditLogService.recordWithin(
          {
            userId,
            action: AuditActionEnum.IMPORT_COMPLETED,
            entity: AuditEntityEnum.IMPORT_BATCH,
            entityId: created._id,
            after: { filename, rowCount, expenseCount: rows.length },
            requestId,
          },
          session,
        );

        return created;
      });

      this.dataVersionService.bump(userId);
      this.logger.log({ userId: userId.toString(), rowCount, batchId: batch._id.toString() }, 'import committed');

      return ImportBatchResponseDTO.fromDocument(batch);
    } catch (error: unknown) {
      if (this.isDuplicateKey(error)) {
        const existing = await this.importsRepository.findByIdempotencyKey(userId, idempotencyKey);

        if (existing !== null) {
          return ImportBatchResponseDTO.fromDocument(existing);
        }
      }

      throw error;
    }
  }

  /**
   * Reports whether an error is a duplicate key violation.
   *
   * @param error - The thrown value.
   * @returns True when the database refused a duplicate.
   */
  private isDuplicateKey(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === DUPLICATE_KEY_ERROR;
  }
}
