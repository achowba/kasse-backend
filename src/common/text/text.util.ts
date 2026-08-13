import {
  FORBIDDEN_CHARACTER_PATTERN,
  INVISIBLE_IN_KEY_PATTERN,
  STRIPPED_CHARACTER_PATTERN,
  WHITESPACE_PATTERN,
} from './text.constants';

/** Two or more plain spaces in a row, left behind once other whitespace is folded. */
const REPEATED_SPACE_PATTERN = / {2,}/g;

/** Combining marks, which `NFKD` separates from the letter they sit on. */
const DIACRITIC_PATTERN = /\p{Diacritic}/gu;

/**
 * Cleans free text on its way in, without changing what it says.
 *
 * @remarks
 * Applied to a value before validation runs, so every length and emptiness rule
 * downstream sees what will actually be stored. A name of three no break spaces
 * therefore fails a minimum length check, which it did not before: it arrived as
 * three characters and was saved as an invisible name.
 *
 * `NFC` composition matters more than it looks. The same visible text can be
 * typed two ways, `e` plus a combining acute or a single precomposed `é`, and
 * without normalising, those are different strings that no user could tell
 * apart. macOS hands over the decomposed form and most other systems the
 * composed one, so the same name typed on two machines compared as unequal.
 *
 * What this does **not** do is decide whether the text is acceptable. Characters
 * that should be refused outright survive this untouched, so that
 * {@link hasForbiddenCharacters} can still see them and answer 400. Cleaning
 * them here would mean an attempt to smuggle a text direction override was
 * silently repaired and never reported.
 *
 * @steps
 * 1. Compose to `NFC`, so equivalent spellings become one spelling.
 * 2. Remove the invisible characters that carry no meaning.
 * 3. Fold every kind of whitespace to a plain space.
 * 4. Collapse repeats and trim.
 *
 * @param value - The text as the caller sent it.
 * @returns The text as it will be stored.
 */
export const sanitiseText = (value: string): string =>
  value
    .normalize('NFC')
    .replace(STRIPPED_CHARACTER_PATTERN, '')
    .replace(WHITESPACE_PATTERN, ' ')
    .replace(REPEATED_SPACE_PATTERN, ' ')
    .trim();

/**
 * Reports whether text carries a character that is refused outright.
 *
 * @remarks
 * Kept separate from {@link sanitiseText} on purpose. These characters are not
 * cleaned, because a control character or a text direction override in a
 * category name is not a paste accident, and silently removing one would hide
 * the attempt instead of stopping it.
 *
 * @param value - The text to inspect.
 * @returns True when the text must be refused.
 */
export const hasForbiddenCharacters = (value: string): boolean => FORBIDDEN_CHARACTER_PATTERN.test(value);

/**
 * Reduces text to the form used to decide whether two values are the same.
 *
 * @remarks
 * A comparison key answers one question: would a person reading these two
 * strings call them the same thing? So it is deliberately more aggressive than
 * {@link sanitiseText}, which has to preserve what the owner actually wrote.
 *
 * Three things it removes that a display name keeps:
 *
 * - **Every invisible character, including the joiners.** Those carry meaning in
 *   real scripts, so a name keeps them, but a key cannot. Otherwise
 *   `Marke<ZWNJ>ting` and `Marketing` are different keys and a picker shows two
 *   entries nobody can tell apart.
 * - **Diacritics.** `Café` and `Cafe` are one category to anybody choosing from
 *   a list. `NFKD` splits the accent from the letter so the accent can be
 *   dropped rather than the whole letter.
 * - **Case.**
 *
 * This does not solve confusable scripts. Cyrillic `а` and Latin `a` render
 * identically and keep different keys, so two categories can still look the
 * same. Catching that needs a confusables mapping, which is a much larger
 * dependency than the problem currently justifies.
 *
 * @steps
 * 1. Decompose to `NFKD`, separating accents from their letters.
 * 2. Remove every invisible character.
 * 3. Remove the freed combining marks.
 * 4. Lower case.
 *
 * @param value - The text to reduce.
 * @returns The comparison key.
 */
export const foldForComparison = (value: string): string =>
  value.normalize('NFKD').replace(INVISIBLE_IN_KEY_PATTERN, '').replace(DIACRITIC_PATTERN, '').toLowerCase();
