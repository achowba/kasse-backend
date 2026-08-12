/*
 * swagger-ui hands its internal, untyped Immutable.js structures to UI plugins,
 * so this file necessarily operates on `any`. The type-safety rules below are
 * disabled deliberately and scoped to this file alone.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/explicit-function-return-type */

/**
 * Swagger UI plugin that makes the operations filter box case insensitive.
 *
 * @remarks
 * The stock filter matches the raw phrase against the tag name only, so
 * searching "plan" misses an operation tagged "Plans". This matches the lower
 * cased phrase against each operation's path, operationId, summary, description,
 * and tag, then drops tags left with no matching operations.
 *
 * @returns The swagger-ui plugin definition, consumed via `swaggerOptions.plugins`.
 */
export const CaseInsensitiveSearchPlugin = () => ({
  fn: {
    opsFilter: (taggedOps: any, phrase: string) => {
      const searchPhrase = phrase?.toLowerCase() ?? '';

      return taggedOps
        .map((tagObject: any, tagName: any) => {
          const operations = tagObject.get('operations');

          const matchedOps = operations.filter((operationEntry: any) => {
            const operationDetails = operationEntry.get('operation');
            const fields = [
              operationEntry.get('path'),
              operationDetails.get('operationId'),
              operationDetails.get('summary'),
              operationDetails.get('description'),
              tagName,
            ];

            return fields.some((field: any) => typeof field === 'string' && field.toLowerCase().includes(searchPhrase));
          });

          return tagObject.set('operations', matchedOps);
        })
        .filter((tagObject: any) => tagObject.get('operations').size > 0);
    },
  },
});
