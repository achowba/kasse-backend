import { ForbiddenException, INestApplication, Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { IAppConfig } from '@common/config';
import { API_PREFIX } from '@common/constants';
import { ApiVersionEnum, NodeEnvEnum } from '@common/enums';
import { AllExceptionsFilter } from '@common/errors';
import { setupSwagger } from '../swagger';

/**
 * Applies global middleware, versioning, validation, and documentation.
 *
 * @remarks
 * Sessions travel in the `Authorization` header rather than a cookie, so there
 * is no cookie parser and no credentialed CORS. The origin allowlist is strict
 * in staging and production and permissive in development and test, where a
 * client's port changes constantly.
 *
 * The validation pipe strips unknown properties and rejects a request that
 * carries them, so nothing unvalidated reaches a service. Documentation is
 * mounted everywhere except production and test.
 *
 * @steps
 * 1. Security headers, then the CORS allowlist.
 * 2. The `/api` prefix and URI versioning, producing `/api/v1/...`.
 * 3. The global validation pipe and the global exception filter.
 * 4. Shutdown hooks, so `SIGTERM` closes connections instead of dropping them.
 * 5. Swagger, when the environment allows it.
 *
 * @param app - The application from {@link initialiseNestApplication}.
 * @returns The same application, fully configured.
 */
export const bootstrapNestServer = (app: INestApplication): INestApplication => {
  const logger = new Logger('bootstrapNestServer');
  const appConfig = app.get(ConfigService).getOrThrow<IAppConfig>('app');
  const isDevelopmentOrTest = [NodeEnvEnum.DEVELOPMENT, NodeEnvEnum.TEST].includes(appConfig.nodeEnv);
  const isDocsEnabled = ![NodeEnvEnum.PRODUCTION, NodeEnvEnum.TEST].includes(appConfig.nodeEnv);

  app.use(
    helmet({
      // Relaxed so the documentation UI and its assets load cross origin.
      crossOriginResourcePolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.enableCors({
    origin: (requestOrigin: string | undefined, callback: (error: Error | null, allow?: boolean) => void): void => {
      const isKnownOrigin = requestOrigin === undefined || appConfig.allowedOrigins.includes(requestOrigin);

      if (isKnownOrigin || isDevelopmentOrTest) {
        callback(null, true);

        return;
      }

      logger.warn(`[bootstrapNestServer] - blocked disallowed CORS origin: ${requestOrigin}`);
      callback(new ForbiddenException('Origin not allowed by CORS policy'));
    },
  });

  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: ApiVersionEnum.V1 });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  if (isDocsEnabled) {
    setupSwagger(app, appConfig.version);
  }

  return app;
};
