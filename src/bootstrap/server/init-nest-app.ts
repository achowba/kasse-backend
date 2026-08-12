import { INestApplication, NestApplicationOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';

/**
 * Creates the Nest application instance.
 *
 * @remarks
 * Buffers the bootstrap logs so that the lines emitted before the pino logger is
 * installed are replayed through it, rather than being written in a different
 * format by the default logger. Extra options are merged over the defaults.
 *
 * @param options - Optional application options merged over the defaults.
 * @returns The initialised application, not yet listening.
 */
export const initialiseNestApplication = async (options?: NestApplicationOptions): Promise<INestApplication> =>
  await NestFactory.create(AppModule, { bufferLogs: true, ...options });
