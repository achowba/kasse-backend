import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '@common/auth';

/**
 * Requires a valid access token, unless the route opted out.
 *
 * @remarks
 * Registered globally, so authentication is on by default and a newly added
 * route is protected without anyone remembering to protect it. A route opts out
 * with `@Public`, which is a visible, greppable decision rather than an omission.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  /**
   * Decides whether the request may proceed.
   *
   * @param context - The execution context, used to read route metadata.
   * @returns True when the route is public, otherwise the result of verifying the token.
   */
  override canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic === true) {
      return true;
    }

    return super.canActivate(context);
  }
}
