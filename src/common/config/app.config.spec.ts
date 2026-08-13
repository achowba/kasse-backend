import { NodeEnvEnum } from '@common/enums';
import { appConfig } from './app.config';

describe('appConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['NODE_ENV'];
    delete process.env['PORT'];
    delete process.env['LOG_LEVEL'];
    delete process.env['CORS_ORIGINS'];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('falls back to development, port 1413, info, and an empty allowlist', () => {
    const config = appConfig();

    expect(config.nodeEnv).toBe(NodeEnvEnum.DEVELOPMENT);
    expect(config.port).toBe(1413);
    expect(config.logLevel).toBe('info');
    expect(config.allowedOrigins).toEqual([]);
  });

  it('reads the values the environment does supply', () => {
    process.env['NODE_ENV'] = NodeEnvEnum.PRODUCTION;
    process.env['PORT'] = '8080';
    process.env['LOG_LEVEL'] = 'debug';

    const config = appConfig();

    expect(config.nodeEnv).toBe(NodeEnvEnum.PRODUCTION);
    expect(config.port).toBe(8080);
    expect(config.logLevel).toBe('debug');
  });

  it('splits, trims, and drops empty entries from the origin list', () => {
    process.env['CORS_ORIGINS'] = ' https://a.test , https://b.test ,, ';

    expect(appConfig().allowedOrigins).toEqual(['https://a.test', 'https://b.test']);
  });

  it('treats a single origin with no commas as one entry', () => {
    process.env['CORS_ORIGINS'] = 'https://only.test';

    expect(appConfig().allowedOrigins).toEqual(['https://only.test']);
  });
});
