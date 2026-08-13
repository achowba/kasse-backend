import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CacheModule } from '@common/cache';
import { appConfig, authConfig, databaseConfig, validateEnvironment } from '@common/config';
import { DatabaseModule } from '@common/database';
import { SeedModule } from './seed.module';
import { SeedService } from './seed.service';

/**
 * The seeder's own root module.
 *
 * @remarks
 * Deliberately not `AppModule`. Booting the server's graph would start the
 * throttler, the logger transport, and the HTTP layer, none of which a command
 * line script needs, and would let a mistake here affect the running API.
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
    SeedModule,
  ],
})
class SeedRootModule {}

/**
 * Runs a seeder and exits.
 *
 * @remarks
 * Uses an application context rather than a Nest application: there is no server
 * to start, and creating one would bind a port for a script that writes rows and
 * exits.
 *
 * The exit code matters. A seeder that logs an error and exits 0 looks like it
 * worked, and the next command in a script would run against an empty database.
 *
 * @steps
 * 1. Read which seeder to run from the first argument.
 * 2. Boot a context with only the modules seeding needs.
 * 3. Run it, close the context, and exit non-zero on failure.
 */
const run = async (): Promise<void> => {
  const logger = new Logger('Seed');
  const which = process.argv[2];

  if (which !== 'spec' && which !== 'demo') {
    logger.error('Usage: seed <spec|demo>');
    process.exitCode = 1;

    return;
  }

  const context = await NestFactory.createApplicationContext(SeedRootModule, { bufferLogs: false });

  try {
    const seedService = context.get(SeedService);

    // The shared catalogue is seeded by CategoriesService on bootstrap, so by the
    // time the context is up the categories these seeders resolve already exist.
    const userId = which === 'spec' ? await seedService.seedSpec() : await seedService.seedDemo();

    logger.log({ seeder: which, userId: userId.toString() }, 'seeding finished');
  } catch (error: unknown) {
    logger.error({ err: error }, 'seeding failed');
    process.exitCode = 1;
  } finally {
    await context.close();
  }
};

void run();
