import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, ThrottlerModuleOptions } from '@nestjs/throttler';
import { LoggerModule, Params } from 'nestjs-pino';
import { CacheModule } from '@common/cache';
import { appConfig, authConfig, databaseConfig, IAppConfig, validateEnvironment } from '@common/config';
import { DatabaseModule } from '@common/database';
import { buildLoggerOptions } from '@common/logging';
import { AuditLogModule } from '@modules/audit-log';
import { AuthModule } from '@modules/auth';
import { CategoriesModule } from '@modules/categories';
import { ExpensesModule } from '@modules/expenses';
import { HealthModule } from '@modules/health';
import { ImportsModule } from '@modules/imports';
import { NlQueryModule } from '@modules/nl-query';
import { PeriodLocksModule } from '@modules/period-locks';
import { PlansModule } from '@modules/plans';
import { ReportsModule } from '@modules/reports';
import { UsersModule } from '@modules/users';

/**
 * Root application module.
 *
 * @remarks
 * Wiring only. It composes platform and feature modules and holds no logic of
 * its own, so the dependency graph of the whole service is readable in one place.
 *
 * Configuration is validated here, at boot, so a missing or malformed variable
 * stops the process rather than surfacing at the first request that needs it.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, authConfig, databaseConfig],
      validate: validateEnvironment,
      cache: true,
    }),
    DatabaseModule,
    CacheModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Params => buildLoggerOptions(configService.getOrThrow<IAppConfig>('app')),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): ThrottlerModuleOptions => {
        const { throttleTtlMs, throttleLimit } = configService.getOrThrow<IAppConfig>('app');

        return [{ ttl: throttleTtlMs, limit: throttleLimit }];
      },
    }),
    AuthModule,
    UsersModule,
    AuditLogModule,
    CategoriesModule,
    PeriodLocksModule,
    PlansModule,
    ExpensesModule,
    ReportsModule,
    ImportsModule,
    NlQueryModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
