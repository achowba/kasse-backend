import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from '@modules/audit-log';
import { CategoriesModule } from '@modules/categories';
import { PeriodLocksModule } from '@modules/period-locks';
import { ExpensesController } from './expenses.controller';
import { ExpensesRepository } from './expenses.repository';
import { ExpensesService } from './expenses.service';
import { Expense, ExpenseSchema } from './schemas/expense.schema';

/**
 * Money actually spent.
 *
 * @remarks
 * Exports {@link ExpensesService} and the repository so the report aggregation,
 * the CSV import, and the seeders can write and read expenses without going
 * through HTTP.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Expense.name, schema: ExpenseSchema }]),
    PeriodLocksModule,
    CategoriesModule,
    AuditLogModule,
  ],
  controllers: [ExpensesController],
  providers: [ExpensesService, ExpensesRepository],
  exports: [ExpensesService, ExpensesRepository, MongooseModule],
})
export class ExpensesModule {}
