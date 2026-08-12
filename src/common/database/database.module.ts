import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule, MongooseModuleFactoryOptions } from '@nestjs/mongoose';
import { IDatabaseConfig } from '@common/config';
import { MAX_POOL_SIZE, SERVER_SELECTION_TIMEOUT_MS } from './database.constants';

/**
 * Owns the database connection.
 *
 * @remarks
 * Global, so feature modules register their schemas with
 * `MongooseModule.forFeature` without re-importing the connection.
 *
 * The server selection timeout is set deliberately. Its default is 30 seconds,
 * which turns a wrong connection string into a boot that appears to hang. Five
 * seconds turns the same mistake into a fast, legible failure.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): MongooseModuleFactoryOptions => {
        const config = configService.getOrThrow<IDatabaseConfig>('database');

        return {
          uri: config.uri,
          autoIndex: config.autoIndex,
          serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
          maxPoolSize: MAX_POOL_SIZE,
        };
      },
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
