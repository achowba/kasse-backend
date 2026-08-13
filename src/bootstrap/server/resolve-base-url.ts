import { IAppConfig } from '@common/config';
import { NodeEnvEnum } from '@common/enums';

/** Trailing slashes, so a configured URL and a path do not join into a double slash. */
const TRAILING_SLASH_PATTERN = /\/+$/;

/**
 * Works out the base URL to advertise at boot, or admits there is none.
 *
 * @remarks
 * The boot line used to build `http://localhost:${port}` unconditionally. On a
 * developer's machine that is exactly right and worth having, because the port
 * is configurable and a reader should not have to guess which one was used.
 *
 * In a deployed environment it is a lie. The container's log announced a URL
 * that resolves to the container itself, which nobody can reach and which is
 * not where the service answers. A log line that confidently names the wrong
 * address is worse than one that names none, because it is the first thing
 * somebody copies when a deployment looks wrong.
 *
 * A process cannot discover its own public address. It sits behind a proxy that
 * terminates TLS and rewrites the host, so the only reliable source is being
 * told, which is what `PUBLIC_URL` is for. Reading a platform's own variable
 * instead would tie the service to one host.
 *
 * When nothing has been configured and the environment is deployed, this returns
 * `null` and the caller logs the port and the paths on their own. Those are true
 * everywhere.
 *
 * @param config - Validated application configuration.
 * @returns The base URL with no trailing slash, or null when it is not knowable.
 */
export const resolveBaseUrl = (config: IAppConfig): string | null => {
  if (config.publicUrl !== null) {
    return config.publicUrl.replace(TRAILING_SLASH_PATTERN, '');
  }

  const isLocal = config.nodeEnv === NodeEnvEnum.DEVELOPMENT || config.nodeEnv === NodeEnvEnum.TEST;

  return isLocal ? `http://localhost:${config.port}` : null;
};
