import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { SwaggerTheme, SwaggerThemeNameEnum } from 'swagger-themes';
import { API_DESCRIPTION, API_TAGS, SWAGGER_UI_OPTIONS } from './swagger.constants';

/**
 * Builds the OpenAPI document description.
 *
 * @remarks
 * Shared by the running server and by the script that writes `openapi.json`, so
 * the committed contract and the served documentation cannot describe the API
 * differently.
 *
 * @param version - The API document version, from application config.
 * @returns The document configuration.
 */
export const buildOpenApiConfig = (version: string): Omit<OpenAPIObject, 'paths'> => {
  const builder = new DocumentBuilder().setTitle('Kasse API').setDescription(API_DESCRIPTION).setVersion(version).addBearerAuth();

  for (const tag of API_TAGS) {
    builder.addTag(tag.name, tag.description);
  }

  return builder.build();
};

/**
 * Builds the OpenAPI document for an application.
 *
 * @param app - The application to describe.
 * @param version - The API document version.
 * @returns The document.
 */
export const buildOpenApiDocument = (app: INestApplication, version: string): OpenAPIObject =>
  SwaggerModule.createDocument(app, buildOpenApiConfig(version));

/**
 * Mounts the dark themed Swagger UI at `/docs`.
 *
 * @remarks
 * Not mounted in production or test. The same document is written to
 * `openapi.json` for clients that generate their types offline, which the web
 * client in its own repository does.
 *
 * @param app - The application to attach the OpenAPI document and UI to.
 * @param version - The API document version, from application config.
 */
export const setupSwagger = (app: INestApplication, version: string): void => {
  SwaggerModule.setup('docs', app, buildOpenApiDocument(app, version), {
    explorer: true,
    customSiteTitle: 'Kasse API',
    customCss: new SwaggerTheme().getBuffer(SwaggerThemeNameEnum.DARK),
    swaggerOptions: SWAGGER_UI_OPTIONS,
  });
};
