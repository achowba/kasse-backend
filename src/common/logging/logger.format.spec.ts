import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { Types } from 'mongoose';
import { logUser } from './log-context';
import { buildRequestProps, redactEntry, redactValue } from './logger.format';
import {
  CIRCULAR_PLACEHOLDER,
  REDACTED_PLACEHOLDER,
  REDACTION_MAX_DEPTH,
  REQUEST_LOG_CONTEXT,
  TRUNCATED_PLACEHOLDER,
} from './logging.constants';

/**
 * Scrubs a value with a fresh path set.
 *
 * @param value - The value to scrub.
 * @returns The scrubbed value.
 */
const scrub = (value: unknown): unknown => redactValue(value, 0, new WeakSet<object>());

describe('redactValue', () => {
  describe('the gap this closes', () => {
    it('redacts a secret nested deeper than any path pattern anticipated', () => {
      const scrubbed = scrub({ user: { profile: { session: { token: 'gho_realtoken' } } } });

      // The reason this exists. pino's `*.token` matches one level, so this
      // survived redaction before, and the invariant held only for shapes
      // somebody had already thought of.
      expect(scrubbed).toEqual({ user: { profile: { session: { token: REDACTED_PLACEHOLDER } } } });
    });

    it('redacts a secret inside an array of objects', () => {
      const scrubbed = scrub({ sessions: [{ refreshToken: 'a' }, { refreshToken: 'b' }] });

      expect(scrubbed).toEqual({ sessions: [{ refreshToken: REDACTED_PLACEHOLDER }, { refreshToken: REDACTED_PLACEHOLDER }] });
    });

    it('matches key names whatever their case', () => {
      const scrubbed = scrub({ Authorization: 'Bearer x', PassWord: 'hunter2', APIKEY: 'k' });

      expect(scrubbed).toEqual({
        Authorization: REDACTED_PLACEHOLDER,
        PassWord: REDACTED_PLACEHOLDER,
        APIKEY: REDACTED_PLACEHOLDER,
      });
    });
  });

  describe('what it leaves alone', () => {
    it('keeps values whose keys are not sensitive', () => {
      expect(scrub({ userId: 'abc', amountMinor: 480_000, month: '2026-01' })).toEqual({
        userId: 'abc',
        amountMinor: 480_000,
        month: '2026-01',
      });
    });

    it('returns primitives untouched', () => {
      expect(scrub('plain')).toBe('plain');
      expect(scrub(42)).toBe(42);
      expect(scrub(null)).toBeNull();
      expect(scrub(undefined)).toBeUndefined();
    });

    it('does not flatten a Date into an unreadable shape', () => {
      const at = new Date('2026-01-15T10:04:11.212Z');

      // Rebuilt key by key, a Date becomes `{}`. The prototype check is what
      // keeps it a Date.
      expect(scrub({ at })).toEqual({ at });
      expect((scrub({ at }) as { at: Date }).at).toBeInstanceOf(Date);
    });

    it('does not flatten an ObjectId, which appears in almost every log line here', () => {
      const userId = new Types.ObjectId();

      expect((scrub({ userId }) as { userId: Types.ObjectId }).userId).toBeInstanceOf(Types.ObjectId);
    });

    it('does not flatten an Error, so its message survives', () => {
      const err = new Error('mongo is down');

      expect((scrub({ err }) as { err: Error }).err).toBeInstanceOf(Error);
    });
  });

  describe('bounding the walk', () => {
    it('replaces a value still nested at the depth limit', () => {
      let deep: Record<string, unknown> = { bottom: 'value' };

      for (let level = 0; level < REDACTION_MAX_DEPTH + 2; level += 1) {
        deep = { nested: deep };
      }

      // Replaced rather than returned. Returning the subtree would let an
      // unredacted, possibly cyclic branch escape the walk entirely.
      expect(JSON.stringify(scrub(deep))).toContain(TRUNCATED_PLACEHOLDER);
    });

    it('replaces a cycle rather than letting it reach the serialiser', () => {
      const cyclic: Record<string, unknown> = { name: 'root' };

      cyclic['self'] = cyclic;

      const scrubbed = scrub(cyclic);

      // Without this a cyclic context throws inside JSON.stringify, and a log
      // line becomes the thing that fails the request.
      expect(scrubbed).toEqual({ name: 'root', self: CIRCULAR_PLACEHOLDER });
      expect(() => JSON.stringify(scrubbed)).not.toThrow();
    });

    it('treats a repeated sibling as a value, not as a cycle', () => {
      const shared = { token: 'secret' };
      const scrubbed = scrub({ first: shared, second: shared });

      // `seen` is the current path, not everything ever visited. Treating the
      // second occurrence as circular would silently drop real context.
      expect(scrubbed).toEqual({
        first: { token: REDACTED_PLACEHOLDER },
        second: { token: REDACTED_PLACEHOLDER },
      });
    });

    it('handles a cycle through an array', () => {
      const entries: unknown[] = [{ id: 1 }];

      entries.push(entries);

      expect(() => JSON.stringify(scrub({ entries }))).not.toThrow();
    });
  });

  it('does not mutate what it was given', () => {
    const original = { user: { token: 'secret' } };

    scrub(original);

    // The caller may still be using the object it logged. Rewriting their data
    // as a side effect of logging it would be a genuinely nasty bug.
    expect(original.user.token).toBe('secret');
  });
});

describe('redactEntry', () => {
  it('redacts a sensitive key at the top level of an entry', () => {
    expect(redactEntry({ msg: 'signed in', accessToken: 'jwt' })).toEqual({
      msg: 'signed in',
      accessToken: REDACTED_PLACEHOLDER,
    });
  });

  it('leaves the fields the logger owns alone', () => {
    const entry = { level: 30, time: 1_786_573_789_034, msg: 'request completed', pid: 4_937, hostname: 'box' };

    expect(redactEntry(entry)).toEqual(entry);
  });

  it('walks into caller supplied context', () => {
    const scrubbed = redactEntry({ msg: 'import failed', batch: { rows: [{ note: 'ok', apiKey: 'k' }] } });

    expect(scrubbed).toEqual({ msg: 'import failed', batch: { rows: [{ note: 'ok', apiKey: REDACTED_PLACEHOLDER }] } });
  });

  it('redacts an idempotency key, which identifies a client operation', () => {
    expect(redactEntry({ msg: 'import replayed', idempotencyKey: 'abc-123' })).toEqual({
      msg: 'import replayed',
      idempotencyKey: REDACTED_PLACEHOLDER,
    });
  });

  it('survives an entry carrying a cycle', () => {
    const context: Record<string, unknown> = { name: 'root' };

    context['self'] = context;

    expect(() => JSON.stringify(redactEntry({ msg: 'odd', context }))).not.toThrow();
  });
});

describe('buildRequestProps', () => {
  /**
   * Builds the props for a request carrying the given parsed body.
   *
   * @param body - The body the parser would have produced, if any.
   * @returns The extra fields stamped on that request's log line.
   */
  const propsFor = (body?: unknown): Record<string, unknown> => {
    const request: IncomingMessage & { body?: unknown } = new IncomingMessage(new Socket());

    request.method = 'POST';
    request.url = '/api/v1/auth/login';

    if (body !== undefined) {
      request.body = body;
    }

    return buildRequestProps(request);
  };

  it('includes the parsed body, which pino-http does not log at all', () => {
    expect(propsFor({ email: 'demo@kasse.app' })['requestBody']).toEqual({ email: 'demo@kasse.app' });
  });

  it('redacts a password while leaving the address readable', () => {
    // Both halves matter. A line that hides the address cannot answer which
    // account was refused, which is the question a 401 raises.
    expect(propsFor({ email: 'demo@kasse.app', password: 'demo-account-password' })['requestBody']).toEqual({
      email: 'demo@kasse.app',
      password: REDACTED_PLACEHOLDER,
    });
  });

  it('redacts a secret nested deeper in the body than any path pattern anticipated', () => {
    // `req.body.password` reaches exactly one level. This is the case that
    // survives it, and the reason the body is scrubbed by key rather than path.
    expect(propsFor({ payload: { credentials: { refreshToken: 'rt_real' } } })['requestBody']).toEqual({
      payload: { credentials: { refreshToken: REDACTED_PLACEHOLDER } },
    });
  });

  it('redacts every credential a signup or a rotation carries', () => {
    expect(propsFor({ password: 'p', token: 't', refreshToken: 'r', accessToken: 'a' })['requestBody']).toEqual({
      password: REDACTED_PLACEHOLDER,
      token: REDACTED_PLACEHOLDER,
      refreshToken: REDACTED_PLACEHOLDER,
      accessToken: REDACTED_PLACEHOLDER,
    });
  });

  it('stamps the request context whether or not there is a body', () => {
    // Without it these lines lose the context the framework's own lines carry,
    // and a reader filtering by context loses exactly the requests.
    expect(propsFor()['context']).toBe(REQUEST_LOG_CONTEXT);
    expect(propsFor({ email: 'demo@kasse.app' })['context']).toBe(REQUEST_LOG_CONTEXT);
  });

  it('adds nothing when the parser produced no body, so a GET line is unchanged', () => {
    expect(propsFor()).not.toHaveProperty('requestBody');
  });

  it('survives a body that cycles back on itself', () => {
    const body: Record<string, unknown> = { email: 'demo@kasse.app' };

    body['self'] = body;

    // A log line must never be the thing that breaks a request.
    expect(() => JSON.stringify(propsFor(body))).not.toThrow();
  });

  describe('identifying the account', () => {
    /**
     * Builds the props for a request the guard has authenticated.
     *
     * @param user - Whatever the guard attached, valid or not.
     * @returns The extra fields stamped on that request's log line.
     */
    const propsForUser = (user: unknown): Record<string, unknown> => {
      const request: IncomingMessage & { user?: unknown } = new IncomingMessage(new Socket());

      request.method = 'GET';
      request.url = '/api/v1/reports/plan-vs-spend';
      request.user = user;

      return buildRequestProps(request);
    };

    it('carries the account id, so every line for one account can be selected', () => {
      const userId = new Types.ObjectId();

      expect(propsForUser({ userId })['user']).toEqual({ id: userId.toHexString() });
    });

    it('accepts an id that is already a string', () => {
      expect(propsForUser({ userId: '6a7e25c9875401477a4b86c4' })['user']).toEqual({ id: '6a7e25c9875401477a4b86c4' });
    });

    it('carries the address the token was issued with', () => {
      const userId = new Types.ObjectId();

      // It rides in the token rather than being looked up, so a request line can
      // name the account without adding a database read to every request.
      expect(propsForUser({ userId, email: 'demo@kasse.app' })['user']).toEqual({
        id: userId.toHexString(),
        email: 'demo@kasse.app',
      });
    });

    it('carries the id alone when the token predates the address claim', () => {
      // A token signed before this change has no email. It stays valid until it
      // expires, so the line has to work without one rather than break.
      expect(propsForUser({ userId: new Types.ObjectId() })['user']).not.toHaveProperty('email');
    });

    it('ignores an address that is not a string', () => {
      const userId = new Types.ObjectId();

      expect(propsForUser({ userId, email: { nested: true } })['user']).toEqual({ id: userId.toHexString() });
    });

    it('omits the user entirely on an unauthenticated request', () => {
      // A public route, a missing token, and a rejected one all land here, and
      // all three still produce a log line.
      expect(propsFor()).not.toHaveProperty('user');
    });

    it.each([
      ['something that is not an object', 'not-a-user'],
      ['an object with no id on it', { email: 'demo@kasse.app' }],
      ['an id that would stringify to nonsense', { userId: { nested: true } }],
    ])('omits the user for %s rather than logging a useless value', (_label: string, user: unknown) => {
      // `[object Object]` is worse than no id: it looks like one, it groups
      // every account together, and it would be believed.
      expect(propsForUser(user)).not.toHaveProperty('user');
    });

    it('still carries the context and the body alongside the user', () => {
      const request: IncomingMessage & { user?: unknown; body?: unknown } = new IncomingMessage(new Socket());
      const userId = new Types.ObjectId();

      request.user = { userId };
      request.body = { month: '2026-03' };

      const props = buildRequestProps(request);

      expect(props['context']).toBe(REQUEST_LOG_CONTEXT);
      expect(props['user']).toEqual({ id: userId.toHexString() });
      expect(props['requestBody']).toEqual({ month: '2026-03' });
    });
  });
});

describe('logUser', () => {
  it('omits the email rather than carrying an undefined key', () => {
    expect(logUser('abc123')).toEqual({ user: { id: 'abc123' } });
  });

  it('includes the email where the account was already loaded', () => {
    expect(logUser('abc123', 'demo@kasse.app')).toEqual({ user: { id: 'abc123', email: 'demo@kasse.app' } });
  });

  it('produces the same key everywhere, which is the point of it', () => {
    // A line saying `userId` and another saying `user.id` cannot be selected by
    // one query, so a search for an account silently returns half its activity.
    expect(Object.keys(logUser('abc123'))).toEqual(['user']);
  });
});
