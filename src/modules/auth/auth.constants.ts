/**
 * Issuer claim stamped into every access token and required when verifying one.
 *
 * @remarks
 * Signing and verification must agree, so the value lives in one place. It also
 * means a token minted by another service with the same key pair is rejected here.
 */
export const TOKEN_ISSUER = 'plan-vs-actual-api';

/** Bytes of randomness in a refresh token. 256 bits, so guessing is not a threat model. */
export const REFRESH_TOKEN_BYTES = 32;

/**
 * Requests allowed per window on the credential routes, which are the brute
 * force surface and so are limited harder than the rest of the API.
 *
 * @remarks
 * Read from the environment here rather than through `ConfigService`, which is
 * the documented exception to that rule. `@Throttle` is a decorator, so its
 * values are needed when the class is defined, before any injector exists. The
 * variables are declared in `.env.example` and validated at boot like the rest.
 */
export const AUTH_THROTTLE_LIMIT = Number(process.env['AUTH_THROTTLE_LIMIT'] ?? 10);

/** Window for the credential route rate limit, in milliseconds. */
export const AUTH_THROTTLE_TTL_MS = Number(process.env['AUTH_THROTTLE_TTL_MS'] ?? 60_000);
