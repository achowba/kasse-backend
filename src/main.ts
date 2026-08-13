import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

/**
 * Boots the HTTP application.
 *
 * Steps: build the Nest application from the root module, then bind the HTTP
 * server to the configured port.
 *
 * Platform concerns (configuration validation, structured logging, the global
 * error filter, API documentation) are added to this bootstrap in the platform
 * module rather than here, so this function stays a single readable sequence.
 *
 * @returns A promise that resolves once the server is accepting connections.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env['PORT'] ?? 3000);
}

void bootstrap();
