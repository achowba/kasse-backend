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

/**
 * Argon2 parameters for password hashing.
 *
 * @remarks
 * The OWASP baseline: 19 MiB of memory, two iterations, one lane. Memory
 * hardness is what makes a stolen hash expensive to attack on a GPU, which a
 * fast hash cannot provide for an input as low in entropy as a password.
 *
 * The algorithm is deliberately absent. The library's `Algorithm` enum is an
 * ambient const enum that `isolatedModules` cannot read, and hardcoding its
 * numeric value would break silently if the library renumbered it. Argon2id is
 * the library default, and a test asserts the produced hash carries the
 * `$argon2id$` marker so a change in that default fails loudly.
 */
export const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * One message for every credential failure.
 *
 * @remarks
 * A wrong password and an unknown address return the same text, so the endpoint
 * cannot be used to discover which addresses are registered.
 */
export const INVALID_CREDENTIALS = 'Invalid email or password.';

/** Shortest password accepted. Length is the single strongest factor. */
export const MINIMUM_PASSWORD_LENGTH = 12;

/** Longest password accepted, bounding the work one request can ask the hasher for. */
export const MAXIMUM_PASSWORD_LENGTH = 128;

/** Longest email accepted, per the practical limit on an address. */
export const MAXIMUM_EMAIL_LENGTH = 254;

/** A base64url encoded 32 byte token is 43 characters. Bound either side of that. */
export const MINIMUM_TOKEN_LENGTH = 20;
export const MAXIMUM_TOKEN_LENGTH = 200;

/** Milliseconds in a day, for turning the configured refresh lifetime into an expiry date. */
export const MILLISECONDS_PER_DAY = 86_400_000;

/** Milliseconds in a second, for converting a JWT `exp` claim. */
export const MILLISECONDS_PER_SECOND = 1_000;
