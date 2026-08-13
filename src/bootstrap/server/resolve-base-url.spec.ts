import { IAppConfig } from '@common/config';
import { NodeEnvEnum } from '@common/enums';
import { resolveBaseUrl } from './resolve-base-url';

/**
 * Builds the configuration this function reads.
 *
 * @param overrides - The fields under test.
 * @returns Application configuration.
 */
const buildConfig = (overrides: Partial<IAppConfig> = {}): IAppConfig => ({
  nodeEnv: NodeEnvEnum.PRODUCTION,
  port: 1413,
  publicUrl: null,
  version: '1.0.0',
  logLevel: 'info',
  allowedOrigins: [],
  throttleTtlMs: 60_000,
  throttleLimit: 120,
  anthropicApiKey: null,
  ...overrides,
});

describe('resolveBaseUrl', () => {
  describe('when a public URL is configured', () => {
    it('uses it, whatever the environment', () => {
      const config = buildConfig({ publicUrl: 'https://kasse.up.railway.app' });

      expect(resolveBaseUrl(config)).toBe('https://kasse.up.railway.app');
    });

    it('drops a trailing slash, so joining a path cannot double it', () => {
      const config = buildConfig({ publicUrl: 'https://kasse.up.railway.app/' });

      expect(resolveBaseUrl(config)).toBe('https://kasse.up.railway.app');
    });

    it('prefers it over localhost even in development', () => {
      const config = buildConfig({ nodeEnv: NodeEnvEnum.DEVELOPMENT, publicUrl: 'https://tunnel.example.test' });

      // Someone running behind a tunnel has said where the service answers, and
      // that answer beats a guess.
      expect(resolveBaseUrl(config)).toBe('https://tunnel.example.test');
    });
  });

  describe('when nothing is configured', () => {
    it.each([
      ['development', NodeEnvEnum.DEVELOPMENT],
      ['test', NodeEnvEnum.TEST],
    ])('reports localhost in %s, where that is genuinely the address', (_label: string, nodeEnv: NodeEnvEnum) => {
      expect(resolveBaseUrl(buildConfig({ nodeEnv }))).toBe('http://localhost:1413');
    });

    it('carries the configured port rather than assuming the default', () => {
      const config = buildConfig({ nodeEnv: NodeEnvEnum.DEVELOPMENT, port: 4000 });

      expect(resolveBaseUrl(config)).toBe('http://localhost:4000');
    });

    it.each([
      ['production', NodeEnvEnum.PRODUCTION],
      ['staging', NodeEnvEnum.STAGING],
    ])('admits it does not know in %s rather than naming localhost', (_label: string, nodeEnv: NodeEnvEnum) => {
      // The bug this replaces. A container announced http://localhost:1413,
      // which resolves to the container itself and is the first thing somebody
      // copies when a deployment looks wrong.
      expect(resolveBaseUrl(buildConfig({ nodeEnv }))).toBeNull();
    });
  });
});
