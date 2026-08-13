/**
 * A deterministic pseudo random sequence.
 *
 * @remarks
 * Not `Math.random`. The demo data has to be identical on every run, or a test
 * asserting anything about it becomes flaky and a reviewer comparing two runs
 * sees differences that mean nothing. This is a linear congruential generator
 * with the constants from Numerical Recipes: unsuitable for anything
 * cryptographic, which is exactly why it is safe to use here where the only
 * requirement is that the numbers look varied and never change.
 *
 * @param seed - The starting value. The same seed always yields the same sequence.
 * @returns A function returning the next value in `[0, 1)`.
 */
export const deterministicRandom = (seed: number): (() => number) => {
  let state = seed;

  return (): number => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };
};

/**
 * Picks a value from a list by a fraction of its length.
 *
 * @typeParam TItem - The list's element type.
 * @param items - The list to pick from. Must not be empty.
 * @param fraction - A value in `[0, 1)`.
 * @returns The chosen item.
 */
export const pick = <TItem>(items: TItem[], fraction: number): TItem => {
  const index = Math.floor(fraction * items.length);

  // The generator's range is half open, so the index cannot reach the length.
  // Clamping anyway costs nothing and means a future change to the generator
  // cannot turn this into an undefined read.
  return items[Math.min(index, items.length - 1)] as TItem;
};

/**
 * Rounds an amount to whole major units.
 *
 * @remarks
 * Seeded amounts end in `.00` because invented data that reads as `4813.67`
 * suggests a precision the numbers do not have, and a reviewer scanning the demo
 * should be able to add a column up in their head.
 *
 * @param minor - The amount in minor units.
 * @returns The amount rounded to the nearest whole major unit, in minor units.
 */
export const roundToMajor = (minor: number): number => Math.round(minor / 100) * 100;
