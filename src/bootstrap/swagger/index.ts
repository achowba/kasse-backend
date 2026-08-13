import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { SwaggerTheme, SwaggerThemeNameEnum } from 'swagger-themes';
import { CaseInsensitiveSearchPlugin } from './plugins';

/**
 * Behaviour of the documentation UI.
 *
 * @property filter - Shows the operations search box.
 * @property showRequestDuration - Reports how long a try-it-out call took.
 * @property persistAuthorization - Keeps a pasted bearer token across reloads.
 * @property tagsSorter - Sorts tags alphabetically rather than by declaration order.
 * @property operationsSorter - Sorts operations alphabetically within a tag.
 * @property plugins - UI plugins, currently the case insensitive filter.
 */
const SWAGGER_UI_OPTIONS = {
  filter: true,
  showRequestDuration: true,
  persistAuthorization: true,
  tagsSorter: 'alpha',
  operationsSorter: 'alpha',
  plugins: [CaseInsensitiveSearchPlugin],
};

/**
 * Prose shown at the top of the documentation, describing the rules a client
 * cannot infer from the schemas alone.
 */
const API_DESCRIPTION = `Monthly spending targets, logged actuals, and variance reporting with locked periods.

**Money** is an integer count of minor units. A field ending in \`Minor\` holds cents.

**Months** are the string \`YYYY-MM\`.

**Variance** is \`actual - plan\`. Variance percent is \`null\` when the plan is zero, never \`NaN\`.

**Missing actuals** default to \`0\`. Pass \`missingActuals=null\` to receive \`null\` instead. Every report row carries \`hasActual\`, so a logged zero is never confused with nothing logged.

**Locked periods** reject writes with \`423\` and the code \`PERIOD_LOCKED\`.

**Deletes are soft.** A \`DELETE\` answers \`204\` and the record stops appearing in reads.

**Sessions** travel in the \`Authorization\` header, never a cookie, so a mobile or desktop client is a first class caller. Access tokens are RS256 signed and short lived; refresh tokens are opaque, single use, and rotate.`;

/**
 * The groups operations are organised into, with what each one is for.
 *
 * @remarks
 * A tag used by a controller but not declared here still groups correctly, but
 * its group has no description. Declaring them means the sidebar explains itself.
 */
const API_TAGS: { name: string; description: string }[] = [
  { name: 'Auth', description: 'Establishing, renewing, and ending sessions.' },
  { name: 'Account', description: 'The signed in account and the settings reports are computed against.' },
  { name: 'Categories', description: 'The shared catalogue and the account’s own categories.' },
  { name: 'Period locks', description: 'Closing and reopening accounting periods. A closed period is read only.' },
  { name: 'Audit log', description: 'The append only trail of changes to financial data.' },
  { name: 'Health', description: 'Liveness and readiness probes.' },
];

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
  const builder = new DocumentBuilder()
    .setTitle('Plan vs Actual API')
    .setDescription(API_DESCRIPTION)
    .setVersion(version)
    .addBearerAuth();

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
    customSiteTitle: 'Plan vs Actual API',
    customCss: new SwaggerTheme().getBuffer(SwaggerThemeNameEnum.DARK),
    swaggerOptions: SWAGGER_UI_OPTIONS,
  });
};
