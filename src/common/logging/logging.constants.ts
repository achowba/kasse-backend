/**
 * Fields scrubbed from every log line.
 *
 * @remarks
 * Redaction is configured once, at the logger, rather than at each call site, so
 * a new call site cannot leak a credential by forgetting to strip it. Adding a
 * field here is cheaper than auditing every log statement that might carry it.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.apiKey',
  'req.body.password',
  'req.body.token',
  'req.body.refreshToken',
];

/**
 * Paths that are too noisy to log on every hit.
 *
 * @remarks
 * A probe every few seconds would otherwise dominate the logs and make the
 * requests that matter harder to find.
 */
export const UNLOGGED_PATHS = ['/api/v1/health', '/api/v1/health/ready', '/docs', '/docs-json'];
