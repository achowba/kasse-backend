import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from '@modules/audit-log';
import { CategoriesModule } from '@modules/categories';
import { PeriodLocksModule } from '@modules/period-locks';
import { PlansController } from './plans.controller';
import { PlansRepository } from './plans.repository';
import { PlansService } from './plans.service';
import { Plan, PlanSchema } from './schemas/plan.schema';

/**
 * Monthly spending targets.
 *
 * @remarks
 * Exports {@link PlansService} and the repository so the report aggregation and
 * the seeders can read targets without going through HTTP.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Plan.name, schema: PlanSchema }]),
    PeriodLocksModule,
    CategoriesModule,
    AuditLogModule,
  ],
  controllers: [PlansController],
  providers: [PlansService, PlansRepository],
  exports: [PlansService, PlansRepository, MongooseModule],
})
export class PlansModule {}
