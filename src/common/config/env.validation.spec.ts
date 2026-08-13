import { NodeEnvEnum } from '@common/enums';
import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  it('accepts an empty environment, because every variable has a default', () => {
    expect(() => validateEnvironment({})).not.toThrow();
  });

  it('converts PORT from the string a process environment always carries', () => {
    const result = validateEnvironment({ PORT: '4000' });

    expect(result.PORT).toBe(4000);
  });

  it('accepts a known environment name', () => {
    const result = validateEnvironment({ NODE_ENV: 'production' });

    expect(result.NODE_ENV).toBe(NodeEnvEnum.PRODUCTION);
  });

  it('rejects an unrecognised environment name', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'prod' })).toThrow(/NODE_ENV/);
  });

  it('rejects a port above the valid range', () => {
    expect(() => validateEnvironment({ PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects a port below the valid range', () => {
    expect(() => validateEnvironment({ PORT: '0' })).toThrow(/PORT/);
  });

  it('reports every problem at once rather than one per restart', () => {
    let message = '';

    try {
      validateEnvironment({ NODE_ENV: 'prod', PORT: '0' });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toContain('NODE_ENV');
    expect(message).toContain('PORT');
  });
});
