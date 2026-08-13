/** Port used when `PORT` is not set. */
export const DEFAULT_PORT = 1413;

/** Log level used when `LOG_LEVEL` is not set. */
export const DEFAULT_LOG_LEVEL = 'info';

/** Rate limit window in milliseconds when `THROTTLE_TTL_MS` is not set. */
export const DEFAULT_THROTTLE_TTL_MS = 60_000;

/** Requests per window when `THROTTLE_LIMIT` is not set. */
export const DEFAULT_THROTTLE_LIMIT = 120;

/** Access token lifetime in seconds when `JWT_ACCESS_TTL_SECONDS` is not set. Fifteen minutes. */
export const DEFAULT_ACCESS_TTL_SECONDS = 900;

/** Refresh token lifetime in days when `JWT_REFRESH_TTL_DAYS` is not set. */
export const DEFAULT_REFRESH_TTL_DAYS = 7;

/**
 * Shortest base64 encoded key the service will start with.
 *
 * @remarks
 * Catches an empty or truncated value. It is not a cryptographic check: the
 * decoded PEM markers are what confirm the value is the kind of key it claims
 * to be.
 */
export const MINIMUM_KEY_LENGTH = 100;

/** Markers a decoded key must contain to be the kind of key it claims to be. */
export const PRIVATE_KEY_MARKER = 'PRIVATE KEY';
export const PUBLIC_KEY_MARKER = 'PUBLIC KEY';

/**
 * Shortest access token lifetime that is workable.
 *
 * @remarks
 * Below a minute, ordinary clock skew between the signer and a verifier is
 * enough to reject freshly issued tokens.
 */
export const MINIMUM_ACCESS_TTL_SECONDS = 60;
