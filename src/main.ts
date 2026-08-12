import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { IAppConfig } from '@common/config';
import { bootstrapNestServer, initialiseNestApplication } from './bootstrap';

/**
 * Boots the HTTP application and starts listening.
 *
 * @steps
 * 1. Create the application with its logs buffered.
 * 2. Install the pino logger and flush the buffered lines through it, so the
 *    boot sequence is recorded in the same format as everything after it.
 * 3. Apply the server bootstrap: middleware, versioning, validation, docs.
 * 4. Listen on the configured port.
 *
 * @returns A promise that resolves once the server is accepting connections.
 */
const bootstrap = async (): Promise<void> => {
  const app = await initialiseNestApplication();

  app.useLogger(app.get(Logger));
  app.flushLogs();

  bootstrapNestServer(app);

  const config = app.get(ConfigService).getOrThrow<IAppConfig>('app');

  await app.listen(config.port);
};

void bootstrap();
