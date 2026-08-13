import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Injects the current request id into a handler parameter.
 *
 * @remarks
 * The id is set by the logger middleware, echoed in the `x-request-id` response
 * header, and included in the error envelope. Passing it explicitly into a
 * handler is what lets an audit entry be correlated with the log lines and the
 * response for the same request.
 *
 * Explicit rather than ambient: reading it from async local storage inside the
 * audit service would be less code at the call site, but it would also make the
 * service impossible to unit test without standing up the storage, and would
 * hide a dependency that the signature otherwise states.
 *
 * @returns A parameter decorator supplying the request id, or undefined when there is none.
 */
export const RequestId = createParamDecorator((_data: unknown, context: ExecutionContext): string | undefined => {
  const request = context.switchToHttp().getRequest<Request & { id?: string }>();

  return typeof request.id === 'string' ? request.id : undefined;
});
