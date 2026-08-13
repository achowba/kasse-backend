import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogController } from './audit-log.controller';
import { AuditLogRepository } from './audit-log.repository';
import { AuditLogService } from './audit-log.service';
import { AuditEntry, AuditEntrySchema } from './schemas/audit-entry.schema';

/**
 * The append only trail of changes to financial data.
 *
 * @remarks
 * Exports {@link AuditLogService}, because every module that changes a plan, an
 * expense, a category, or a lock records that change here.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: AuditEntry.name, schema: AuditEntrySchema }])],
  controllers: [AuditLogController],
  providers: [AuditLogService, AuditLogRepository],
  exports: [AuditLogService],
})
export class AuditLogModule {}
