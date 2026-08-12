import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from '@modules/audit-log';
import { PeriodLocksController } from './period-locks.controller';
import { PeriodLocksRepository } from './period-locks.repository';
import { PeriodLocksService } from './period-locks.service';
import { PeriodLock, PeriodLockSchema } from './schemas/period-lock.schema';

/**
 * Closed accounting periods, and the gate that enforces them.
 *
 * @remarks
 * Exports {@link PeriodLocksService} because plans, expenses, and the CSV import
 * all call its gate before writing. That is the whole reason the enforcement
 * lives in a service rather than in a guard: an import writes rows without ever
 * passing through a route for each one.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: PeriodLock.name, schema: PeriodLockSchema }]), AuditLogModule],
  controllers: [PeriodLocksController],
  providers: [PeriodLocksService, PeriodLocksRepository],
  exports: [PeriodLocksService],
})
export class PeriodLocksModule {}
