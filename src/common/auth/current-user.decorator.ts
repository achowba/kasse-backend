import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { IAuthenticatedUser } from './authenticated-user.interface';

/**
 * Injects the authenticated caller into a handler parameter.
 *
 * @remarks
 * Throws rather than returning undefined when there is no caller. That only
 * happens if a route is left unguarded by mistake, and a handler receiving
 * `undefined` where it expects a user id would quietly query across every
 * account. Failing loudly is the safer outcome.
 *
 * @returns A parameter decorator supplying the {@link IAuthenticatedUser}.
 * @throws UnauthorizedException When the request carries no authenticated user.
 */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): IAuthenticatedUser => {
  const request = context.switchToHttp().getRequest<Request & { user?: IAuthenticatedUser }>();

  if (request.user === undefined) {
    throw new UnauthorizedException('No authenticated user on this request.');
  }

  return request.user;
});
