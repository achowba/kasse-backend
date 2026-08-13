import { NodeEnvEnum } from '@common/enums';
import { validateEnvironment } from './env.validation';

/** The minimum environment that boots the service. */
const VALID_ENV = { MONGODB_URI: 'mongodb://localhost:27017/pva?directConnection=true' };

describe('validateEnvironment', () => {
  it('accepts an environment carrying only the database URI', () => {
    expect(() => validateEnvironment({ ...VALID_ENV })).not.toThrow();
  });

  it('rejects an environment with no database URI, because the service cannot serve without one', () => {
    expect(() => validateEnvironment({})).toThrow(/MONGODB_URI/);
  });

  it('rejects an empty database URI rather than treating it as absent', () => {
    expect(() => validateEnvironment({ MONGODB_URI: '' })).toThrow(/MONGODB_URI/);
  });

  it('converts PORT from the string a process environment always carries', () => {
    const result = validateEnvironment({ ...VALID_ENV, PORT: '4000' });

    expect(result.PORT).toBe(4000);
  });

  it('accepts a known environment name', () => {
    const result = validateEnvironment({ ...VALID_ENV, NODE_ENV: 'production' });

    expect(result.NODE_ENV).toBe(NodeEnvEnum.PRODUCTION);
  });

  it('rejects an unrecognised environment name', () => {
    expect(() => validateEnvironment({ ...VALID_ENV, NODE_ENV: 'prod' })).toThrow(/NODE_ENV/);
  });

  it('rejects a port above the valid range', () => {
    expect(() => validateEnvironment({ ...VALID_ENV, PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects a port below the valid range', () => {
    expect(() => validateEnvironment({ ...VALID_ENV, PORT: '0' })).toThrow(/PORT/);
  });

  it('reports every problem at once rather than one per restart', () => {
    let message = '';

    try {
      validateEnvironment({ NODE_ENV: 'prod', PORT: '0' });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toContain('MONGODB_URI');
    expect(message).toContain('NODE_ENV');
    expect(message).toContain('PORT');
  });
});
