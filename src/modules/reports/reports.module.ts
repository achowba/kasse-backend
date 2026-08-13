import { Module } from '@nestjs/common';
import { ExpensesModule } from '@modules/expenses';
import { PlansModule } from '@modules/plans';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

/**
 * Plan against actual, with variance.
 *
 * @remarks
 * Imports plans and expenses for their models rather than their services. The
 * report is one aggregation across both collections, so it needs the schemas
 * registered, not the business rules that write them.
 *
 * The dependency runs one way. Plans, expenses, and locks invalidate this
 * module's cache through `DataVersionService` in `@common/cache`, which neither
 * side owns, so no feature module imports another back.
 */
@Module({
  imports: [PlansModule, ExpensesModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository],
  exports: [ReportsService],
})
export class ReportsModule {}
