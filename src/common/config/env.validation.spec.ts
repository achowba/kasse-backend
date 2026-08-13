import { NodeEnvEnum } from '@common/enums';
import { validateEnvironment } from './env.validation';

/**
 * Builds a base64 value that decodes to something PEM shaped.
 *
 * @remarks
 * Validation checks the decoded marker and the encoded length, not that the key
 * is cryptographically usable, so a real key pair is unnecessary here and would
 * make the test slow. A signing test would need real keys; this one does not.
 *
 * @param marker - The PEM header to embed, such as `PRIVATE KEY`.
 * @returns The base64 encoded fake key.
 */
const fakeKey = (marker: string): string =>
  Buffer.from(`-----BEGIN ${marker}-----\n${'A'.repeat(200)}\n-----END ${marker}-----`).toString('base64');

/** The minimum environment that boots the service. */
const VALID_ENV = {
  MONGODB_URI: 'mongodb://localhost:27017/pva?directConnection=true',
  JWT_PRIVATE_KEY: fakeKey('PRIVATE KEY'),
  JWT_PUBLIC_KEY: fakeKey('PUBLIC KEY'),
};

describe('validateEnvironment', () => {
  it('accepts an environment carrying only the required variables', () => {
    expect(() => validateEnvironment({ ...VALID_ENV })).not.toThrow();
  });

  describe('the database URI', () => {
    it('is required, because the service cannot serve without a database', () => {
      const { MONGODB_URI: _omitted, ...withoutUri } = VALID_ENV;

      expect(() => validateEnvironment(withoutUri)).toThrow(/MONGODB_URI/);
    });

    it('is rejected when empty rather than treated as absent', () => {
      expect(() => validateEnvironment({ ...VALID_ENV, MONGODB_URI: '' })).toThrow(/MONGODB_URI/);
    });
  });

  describe('the signing keys', () => {
    it('rejects a missing private key', () => {
      const { JWT_PRIVATE_KEY: _omitted, ...withoutKey } = VALID_ENV;

      expect(() => validateEnvironment(withoutKey)).toThrow(/JWT_PRIVATE_KEY/);
    });

    it('rejects a missing public key', () => {
      const { JWT_PUBLIC_KEY: _omitted, ...withoutKey } = VALID_ENV;

      expect(() => validateEnvironment(withoutKey)).toThrow(/JWT_PUBLIC_KEY/);
    });

    it('rejects a value that is base64 but does not decode to a private key', () => {
      const notAKey = Buffer.from('x'.repeat(200)).toString('base64');

      expect(() => validateEnvironment({ ...VALID_ENV, JWT_PRIVATE_KEY: notAKey })).toThrow(/JWT_PRIVATE_KEY/);
    });

    it('rejects a public key pasted into the private key slot', () => {
      // A real mistake, and one that would otherwise surface as an unhelpful
      // signing failure at the first login rather than at boot.
      expect(() => validateEnvironment({ ...VALID_ENV, JWT_PRIVATE_KEY: fakeKey('PUBLIC KEY') })).toThrow(/JWT_PRIVATE_KEY/);
    });

    it('rejects a truncated key', () => {
      expect(() => validateEnvironment({ ...VALID_ENV, JWT_PUBLIC_KEY: 'dG9vLXNob3J0' })).toThrow(/JWT_PUBLIC_KEY/);
    });
  });

  describe('optional settings', () => {
    it('converts PORT from the string a process environment always carries', () => {
      expect(validateEnvironment({ ...VALID_ENV, PORT: '4000' }).PORT).toBe(4000);
    });

    it('accepts a known environment name', () => {
      expect(validateEnvironment({ ...VALID_ENV, NODE_ENV: 'production' }).NODE_ENV).toBe(NodeEnvEnum.PRODUCTION);
    });

    it('rejects an unrecognised environment name', () => {
      expect(() => validateEnvironment({ ...VALID_ENV, NODE_ENV: 'prod' })).toThrow(/NODE_ENV/);
    });

    it('rejects a port outside the valid range', () => {
      expect(() => validateEnvironment({ ...VALID_ENV, PORT: '70000' })).toThrow(/PORT/);
      expect(() => validateEnvironment({ ...VALID_ENV, PORT: '0' })).toThrow(/PORT/);
    });

    it('rejects an access token lifetime short enough that clock skew alone would break it', () => {
      expect(() => validateEnvironment({ ...VALID_ENV, JWT_ACCESS_TTL_SECONDS: '30' })).toThrow(/JWT_ACCESS_TTL_SECONDS/);
    });
  });

  describe('the limits on the two most expensive routes', () => {
    // These are read straight from `process.env` by `@common/throttling`, because
    // `@Throttle` is a decorator and needs its values before an injector exists.
    // That left them outside this schema, so a malformed value became `NaN`,
    // every count compared false against it, and the limit was not wrong but
    // absent, with nothing said at boot.
    it.each(['REPORT_THROTTLE_LIMIT', 'IMPORT_THROTTLE_LIMIT', 'EXPENSIVE_THROTTLE_TTL_MS'])(
      'rejects a %s that is not a number',
      (variable: string) => {
        expect(() => validateEnvironment({ ...VALID_ENV, [variable]: 'six' })).toThrow(new RegExp(variable));
      },
    );

    it.each(['REPORT_THROTTLE_LIMIT', 'IMPORT_THROTTLE_LIMIT', 'EXPENSIVE_THROTTLE_TTL_MS'])(
      'rejects a %s of zero, which would refuse every request rather than none',
      (variable: string) => {
        expect(() => validateEnvironment({ ...VALID_ENV, [variable]: '0' })).toThrow(new RegExp(variable));
      },
    );

    it('accepts them absent, since each carries a documented default', () => {
      expect(() => validateEnvironment({ ...VALID_ENV })).not.toThrow();
    });

    it('converts them from the strings a process environment always carries', () => {
      const validated = validateEnvironment({
        ...VALID_ENV,
        REPORT_THROTTLE_LIMIT: '30',
        IMPORT_THROTTLE_LIMIT: '3',
        EXPENSIVE_THROTTLE_TTL_MS: '30000',
      });

      expect(validated.REPORT_THROTTLE_LIMIT).toBe(30);
      expect(validated.IMPORT_THROTTLE_LIMIT).toBe(3);
      expect(validated.EXPENSIVE_THROTTLE_TTL_MS).toBe(30_000);
    });
  });

  it('reports every problem at once rather than one per restart', () => {
    let message = '';

    try {
      validateEnvironment({ NODE_ENV: 'prod', PORT: '0' });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toContain('MONGODB_URI');
    expect(message).toContain('JWT_PRIVATE_KEY');
    expect(message).toContain('NODE_ENV');
    expect(message).toContain('PORT');
  });
});
