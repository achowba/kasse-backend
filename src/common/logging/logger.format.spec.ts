import { Types } from 'mongoose';
import { redactEntry, redactValue } from './logger.format';
import { CIRCULAR_PLACEHOLDER, REDACTED_PLACEHOLDER, REDACTION_MAX_DEPTH, TRUNCATED_PLACEHOLDER } from './logging.constants';

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
