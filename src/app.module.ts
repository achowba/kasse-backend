import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule, Params } from 'nestjs-pino';
import { appConfig, databaseConfig, IAppConfig, validateEnvironment } from '@common/config';
import { DatabaseModule } from '@common/database';
import { buildLoggerOptions } from '@common/logging';
import { HealthModule } from '@modules/health';

/** Rate limit window, in milliseconds. */
const THROTTLE_TTL_MS = 60_000;

/** Requests allowed per window, per caller. Auth routes tighten this further. */
const THROTTLE_LIMIT = 120;

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
      load: [appConfig, databaseConfig],
      validate: validateEnvironment,
      cache: true,
    }),
    DatabaseModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Params => buildLoggerOptions(configService.getOrThrow<IAppConfig>('app')),
    }),
    ThrottlerModule.forRoot([{ ttl: THROTTLE_TTL_MS, limit: THROTTLE_LIMIT }]),
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
