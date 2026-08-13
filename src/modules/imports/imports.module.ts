import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from '@modules/audit-log';
import { CategoriesModule } from '@modules/categories';
import { ExpensesModule } from '@modules/expenses';
import { PeriodLocksModule } from '@modules/period-locks';
import { ImportsController } from './imports.controller';
import { ImportsRepository } from './imports.repository';
import { ImportsService } from './imports.service';
import { ImportBatch, ImportBatchSchema } from './schemas/import-batch.schema';

/**
 * Bulk import of expenses from a CSV file.
 *
 * @remarks
 * The one module that composes several others rather than owning a slice of the
 * domain: it resolves categories, checks period locks, writes expenses, and
 * audits the result. It exports nothing, because nothing else needs to import a
 * file on another module's behalf.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: ImportBatch.name, schema: ImportBatchSchema }]),
    ExpensesModule,
    CategoriesModule,
    PeriodLocksModule,
    AuditLogModule,
  ],
  controllers: [ImportsController],
  providers: [ImportsService, ImportsRepository],
})
export class ImportsModule {}
