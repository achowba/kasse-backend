import { SetMetadata } from '@nestjs/common';

/** Metadata key the authentication guard reads. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without a session.
 *
 * @remarks
 * Authentication is on by default: the guard is global, so a new route is
 * protected unless it opts out here. The alternative, decorating every protected
 * route, means a forgotten decorator silently exposes data.
 *
 * @returns A decorator that exempts the route from authentication.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
