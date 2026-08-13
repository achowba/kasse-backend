import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth';
import { CategoriesModule } from '@modules/categories';
import { ExpensesModule } from '@modules/expenses';
import { PeriodLocksModule } from '@modules/period-locks';
import { PlansModule } from '@modules/plans';
import { UsersModule } from '@modules/users';
import { SeedService } from './seed.service';

/**
 * Seeding, wired for a command line context rather than the HTTP server.
 *
 * @remarks
 * Not imported by `AppModule`. A running API has no business exposing a way to
 * fill its own database, and leaving this out of the server's graph means there
 * is no route that could reach it by accident.
 */
@Module({
  imports: [AuthModule, UsersModule, CategoriesModule, PlansModule, ExpensesModule, PeriodLocksModule],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
