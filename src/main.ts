import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { IAppConfig } from '@common/config';
import { API_PREFIX, BOOTSTRAP_CONTEXT } from '@common/constants';
import { ApiVersionEnum, NodeEnvEnum } from '@common/enums';
import { bootstrapNestServer, initialiseNestApplication, resolveBaseUrl } from './bootstrap';

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

  // Null when the public address is not knowable, which is every deployed
  // environment that has not been told one. This used to say `localhost`
  // regardless, so a container announced an address that resolves to itself and
  // that nobody can reach. Naming the wrong address is worse than naming none,
  // because it is the first thing somebody copies when a deployment looks wrong.
  const baseUrl = resolveBaseUrl(config);

  // Nest prefixes a URI version with `v`, and the enum holds only the number, so
  // the `v` belongs here rather than in the enum where it would be doubled on
  // every route.
  const apiPath = `/${API_PREFIX}/v${ApiVersionEnum.V1}`;

  /**
   * Qualifies a path with the base URL when there is one.
   *
   * @param path - The absolute path to report.
   * @returns The full URL, or the path alone when no host is known.
   */
  const address = (path: string): string => (baseUrl === null ? path : `${baseUrl}${path}`);

  logger.log(
    {
      port: config.port,
      environment: config.nodeEnv,
      api: address(apiPath),
      health: address(`${apiPath}/health`),
      ...(config.nodeEnv === NodeEnvEnum.PRODUCTION ? {} : { docs: address('/docs') }),
    },
    // The port is always true, so it carries the message when the host cannot.
    baseUrl === null ? `listening on port ${config.port}` : `listening on ${baseUrl}`,
  );
};

void bootstrap();
