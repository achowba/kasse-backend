import { deterministicRandom, pick, roundToMajor } from './seed.util';

describe('deterministicRandom', () => {
  it('produces the same sequence for the same seed, every time', () => {
    const first = deterministicRandom(42);
    const second = deterministicRandom(42);

    // The whole reason this exists instead of Math.random. A demo that changes
    // between runs cannot be asserted about, and a screenshot of it goes stale.
    expect(Array.from({ length: 10 }, () => first())).toEqual(Array.from({ length: 10 }, () => second()));
  });

  it('produces a different sequence for a different seed', () => {
    const first = deterministicRandom(1);
    const second = deterministicRandom(2);

    expect(first()).not.toBe(second());
  });

  it('stays inside the half open unit interval', () => {
    const random = deterministicRandom(7);
    const values = Array.from({ length: 500 }, () => random());

    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    // Half open, which is what makes `pick` unable to reach past the end of a
    // list without clamping.
    expect(Math.max(...values)).toBeLessThan(1);
  });

  it('does not immediately repeat itself', () => {
    const random = deterministicRandom(99);
    const values = Array.from({ length: 200 }, () => random());

    expect(new Set(values).size).toBeGreaterThan(150);
  });
});

describe('pick', () => {
  const items = ['a', 'b', 'c', 'd'];

  it('picks the first item at the bottom of the range', () => {
    expect(pick(items, 0)).toBe('a');
  });

  it('picks the last item just below the top of the range', () => {
    expect(pick(items, 0.999)).toBe('d');
  });

  it('spreads evenly across the list', () => {
    expect([pick(items, 0.1), pick(items, 0.3), pick(items, 0.6), pick(items, 0.8)]).toEqual(['a', 'b', 'c', 'd']);
  });

  it('clamps rather than reading past the end', () => {
    // The generator's range is half open so this cannot happen today. Clamping
    // means a future change to the generator cannot turn it into undefined.
    expect(pick(items, 1)).toBe('d');
  });

  it('handles a single item list', () => {
    expect(pick(['only'], 0.5)).toBe('only');
  });
});

describe('roundToMajor', () => {
  it('rounds to whole major units', () => {
    expect(roundToMajor(481_367)).toBe(481_400);
  });

  it('leaves a whole major amount alone', () => {
    expect(roundToMajor(480_000)).toBe(480_000);
  });

  it('rounds a half unit up', () => {
    expect(roundToMajor(150)).toBe(200);
  });

  it('rounds a negative amount, which a seeded refund would produce', () => {
    expect(roundToMajor(-25_049)).toBe(-25_000);
  });

  it('leaves zero alone', () => {
    expect(roundToMajor(0)).toBe(0);
  });
});
