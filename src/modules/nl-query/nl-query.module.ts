import { Module } from '@nestjs/common';
import { AuditLogModule } from '@modules/audit-log';
import { CategoriesModule } from '@modules/categories';
import { ReportsModule } from '@modules/reports';
import { NlQueryController } from './nl-query.controller';
import { NlQueryService } from './nl-query.service';

/**
 * Ask about spending in plain language.
 *
 * @remarks
 * A thin layer over the report. It owns no schema and no collection: its whole
 * job is turning a sentence into a filter the reports module already knows how to
 * run, which is what keeps the model unable to reach anything the report endpoint
 * could not.
 */
@Module({
  imports: [ReportsModule, CategoriesModule, AuditLogModule],
  controllers: [NlQueryController],
  providers: [NlQueryService],
  exports: [NlQueryService],
})
export class NlQueryModule {}
