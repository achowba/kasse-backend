import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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
const API_DESCRIPTION = [
  'Monthly spending targets, logged actuals, and variance reporting with locked periods.',
  '',
  '**Money** is an integer count of minor units. A field ending in `Minor` holds cents.',
  '',
  '**Months** are the string `YYYY-MM`.',
  '',
  '**Variance** is `actual - plan`. Variance percent is `null` when the plan is zero, never `NaN`.',
  '',
  '**Missing actuals** default to `0`. Pass `missingActuals=null` to receive `null` instead.',
  'Every report row carries `hasActual`, so a logged zero is never confused with nothing logged.',
  '',
  '**Locked periods** reject writes with `423` and the code `PERIOD_LOCKED`.',
  '',
  '**Deletes are soft.** A `DELETE` answers `204` and the record stops appearing in reads.',
].join('\n');

/**
 * Mounts the dark themed Swagger UI at `/docs`.
 *
 * @remarks
 * Not mounted in production or test. The generated document is also the contract
 * the web client builds its types from, which is why every DTO carries Swagger
 * decorators: an undocumented field effectively does not exist.
 *
 * @param app - The application to attach the OpenAPI document and UI to.
 * @param version - The API document version, from application config.
 */
export const setupSwagger = (app: INestApplication, version: string): void => {
  const config = new DocumentBuilder()
    .setTitle('Plan vs Actual API')
    .setDescription(API_DESCRIPTION)
    .setVersion(version)
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const theme = new SwaggerTheme();

  SwaggerModule.setup('docs', app, document, {
    explorer: true,
    customSiteTitle: 'Plan vs Actual API',
    customCss: theme.getBuffer(SwaggerThemeNameEnum.DARK),
    swaggerOptions: SWAGGER_UI_OPTIONS,
  });
};
