import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { IAppConfig } from '@common/config';
import { API_PREFIX, BOOTSTRAP_CONTEXT } from '@common/constants';
import { ApiVersionEnum, NodeEnvEnum } from '@common/enums';
import { bootstrapNestServer, initialiseNestApplication } from './bootstrap';

/**
 * Boots the HTTP application and starts listening.
 *
 * @steps
 * 1. Create the application with its logs buffered.
 * 2. Install the pino logger and flush the buffered lines through it, so the
 *    boot sequence is recorded in the same format as everything after it.
 * 3. Apply the server bootstrap: middleware, versioning, validation, docs.
 * 4. Listen on the configured port, and say where.
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

  // "Nest application successfully started" does not say where it started, which
  // leaves a developer guessing at a port they may well have overridden. The
  // addresses below are the three anyone actually wants next.
  // Nest's own Logger, which routes through the pino logger installed above,
  // so this line is formatted and redacted like every other.
  const logger = new NestLogger(BOOTSTRAP_CONTEXT);
  const baseUrl = `http://localhost:${config.port}`;

  logger.log(
    {
      port: config.port,
      environment: config.nodeEnv,
      // Nest prefixes a URI version with `v`, and the enum holds only the
      // number, so the `v` belongs here rather than in the enum where it would
      // end up doubled on every route.
      api: `${baseUrl}/${API_PREFIX}/v${ApiVersionEnum.V1}`,
      health: `${baseUrl}/${API_PREFIX}/v${ApiVersionEnum.V1}/health`,
      ...(config.nodeEnv === NodeEnvEnum.PRODUCTION ? {} : { docs: `${baseUrl}/docs` }),
    },
    `listening on ${baseUrl}`,
  );
};

void bootstrap();
