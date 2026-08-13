import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { PaginationDTO } from './pagination.dto';

/**
 * Documents a paginated list response.
 *
 * @remarks
 * `@ApiOkResponse({ type: [Thing] })` documents a **bare array**, which is what
 * every list endpoint here used to claim. The services return the envelope from
 * `toPaginatedResponse`, so the published contract described a shape the API has
 * never produced, and a client generating types from `openapi.json` would have
 * destructured an array that is really an object.
 *
 * Nothing catches that: the contract check only asserts the committed file
 * matches the running app's own document, and both were wrong in the same way.
 * It is exactly the class of bug that only surfaces in another repository, which
 * is why it survived until the frontend was about to consume the file.
 *
 * `getSchemaPath` composes the real shape instead, and `@ApiExtraModels`
 * registers the item type, which is otherwise never referenced directly and so
 * would be pruned from the document.
 *
 * @typeParam TModel - The item type carried in `items`.
 * @param model - The response DTO for a single record.
 * @param description - What the page contains.
 * @returns The composed Swagger decorators.
 */
export const ApiPaginatedResponse = <TModel extends Type<unknown>>(model: TModel, description: string): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(model, PaginationDTO),
    ApiOkResponse({
      description,
      schema: {
        type: 'object',
        required: ['items', 'pagination'],
        properties: {
          items: { type: 'array', items: { $ref: getSchemaPath(model) } },
          pagination: { $ref: getSchemaPath(PaginationDTO) },
        },
      },
    }),
  );
