/**
 * An inclusive range of code points, as `[first, last]`.
 *
 * @remarks
 * A single character is written as a range whose ends are equal, so every entry
 * in a table below reads the same way.
 */
type CodePointRange = readonly [number, number];

/**
 * Builds a regular expression matching any code point in the given ranges.
 *
 * @remarks
 * The patterns in this file are assembled from numbers rather than written as
 * literal characters, and that is the whole point. Every character this module
 * deals with is invisible. A regular expression containing them could not be
 * reviewed in a diff, could not survive a careless copy or a well meaning
 * formatter, and would be the exact failure the module exists to prevent. A
 * reader sees `0x200b` and can look it up.
 *
 * Each end is emitted as a `\u{...}` escape, which needs the `u` flag and covers
 * astral planes without surrogate pair arithmetic.
 *
 * @param ranges - The code point ranges to match.
 * @param flags - Regular expression flags. `u` is added.
 * @returns A character class matching any code point in the ranges.
 */
const buildPattern = (ranges: readonly CodePointRange[], flags: string): RegExp => {
  const characterClass = ranges
    .map(([first, last]) => {
      const from = `\\u{${first.toString(16)}}`;

      return first === last ? from : `${from}-\\u{${last.toString(16)}}`;
    })
    .join('');

  return new RegExp(`[${characterClass}]`, `${flags}u`);
};

/**
 * Invisible characters removed from user text before it is stored.
 *
 * @remarks
 * None of these changes what a reader sees, and every one changes what the bytes
 * compare as. That is the whole problem: two names indistinguishable on screen
 * stop being equal to the database.
 *
 * | Range | What it is | Why it is here |
 * |---|---|---|
 * | `00AD` | Soft hyphen | A line break hint that survives copy and paste. |
 * | `180E` | Mongolian vowel separator | Reclassified as a format character, invisible in every modern font. |
 * | `200B` | Zero width space | The usual way a duplicate name is smuggled past a uniqueness check. |
 * | `2060` | Word joiner | Zero width, no effect on meaning. |
 * | `FEFF` | Byte order mark | Arrives at the front of anything a spreadsheet saves as UTF-8 with a BOM. |
 * | `FE00` to `FE0F` | Variation selectors | Choose a glyph variant, render as nothing alone. |
 * | `E0100` to `E01EF` | Variation selectors supplement | The same, for the astral plane. |
 * | `E0000` to `E007F` | Tag characters | Can encode a whole hidden message inside what looks like one word. |
 *
 * Zero width joiner (`200D`) and non joiner (`200C`) are deliberately absent.
 * They carry meaning: joiners build emoji sequences, and both are required for
 * correct rendering in Persian, Hindi, and other scripts, so removing them would
 * corrupt legitimate text. {@link INVISIBLE_IN_KEY_RANGES} strips them from the
 * comparison key instead, which closes the duplicate hole without damaging what
 * is displayed.
 */
const STRIPPED_RANGES: readonly CodePointRange[] = [
  [0x00ad, 0x00ad],
  [0x180e, 0x180e],
  [0x200b, 0x200b],
  [0x2060, 0x2060],
  [0xfeff, 0xfeff],
  [0xfe00, 0xfe0f],
  [0xe0100, 0xe01ef],
  [0xe0000, 0xe007f],
];

/**
 * Everything invisible, for building a comparison key.
 *
 * @remarks
 * {@link STRIPPED_RANGES} plus the two joiners it deliberately keeps. A key
 * exists only to decide whether two names are the same name, so nothing
 * invisible may contribute to it. Keeping a joiner here would let
 * `Marke<ZWNJ>ting` and `Marketing` be separate categories that no reader could
 * tell apart, which is precisely the duplicate the key is meant to catch.
 */
const INVISIBLE_IN_KEY_RANGES: readonly CodePointRange[] = [...STRIPPED_RANGES, [0x200c, 0x200d]];

/**
 * Characters that cause the request to be rejected rather than cleaned.
 *
 * @remarks
 * The distinction from {@link STRIPPED_RANGES} is deliberate. A stray variation
 * selector is a paste accident, and quietly removing it is a kindness. These are
 * different.
 *
 * | Range | What it is | Why it is refused |
 * |---|---|---|
 * | `0000` to `0008`, `000B` to `000C`, `000E` to `001F` | C0 controls | A `NUL` or an `ESC` in a category name is not a typing mistake. Tab, newline, and carriage return are excluded here and folded to a space instead. |
 * | `007F` to `009F` | Delete and C1 controls | The same, and invisible in most renderers. |
 * | `202A` to `202E` | Bidirectional embeddings and overrides | Reorder how text renders without changing its bytes. |
 * | `2066` to `2069` | Bidirectional isolates | The same, and newer. |
 *
 * The bidirectional entries are the reason this list rejects rather than
 * strips. They let a string display as one thing and compare as another, which
 * is the Trojan Source class of attack. Removing one silently would hide the
 * attempt rather than stop it: a refusal is a signal, a silent repair is not.
 */
const FORBIDDEN_RANGES: readonly CodePointRange[] = [
  [0x0000, 0x0008],
  [0x000b, 0x000c],
  [0x000e, 0x001f],
  [0x007f, 0x009f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];

/**
 * Whitespace of every kind, folded to a single plain space.
 *
 * @remarks
 * Tab, newline, and carriage return are included on purpose. They are real
 * whitespace rather than an attack, and a name pasted out of a spreadsheet cell
 * routinely carries one, so folding them is friendlier than a refusal. It also
 * keeps a name to a single line without needing a separate rule.
 *
 * The rest are the Unicode spaces that look exactly like `0020` and are not: no
 * break space, the en and em quad family, the line and paragraph separators, the
 * narrow and medium mathematical spaces, and the ideographic space.
 */
const WHITESPACE_RANGES: readonly CodePointRange[] = [
  [0x0009, 0x000a],
  [0x000d, 0x000d],
  [0x00a0, 0x00a0],
  [0x1680, 0x1680],
  [0x2000, 0x200a],
  [0x2028, 0x2029],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
];

/** Matches any invisible character removed from stored text. See {@link STRIPPED_RANGES}. */
export const STRIPPED_CHARACTER_PATTERN = buildPattern(STRIPPED_RANGES, 'g');

/** Matches any invisible character removed from a comparison key. See {@link INVISIBLE_IN_KEY_RANGES}. */
export const INVISIBLE_IN_KEY_PATTERN = buildPattern(INVISIBLE_IN_KEY_RANGES, 'g');

/** Matches any character whose presence rejects the request. See {@link FORBIDDEN_RANGES}. */
export const FORBIDDEN_CHARACTER_PATTERN = buildPattern(FORBIDDEN_RANGES, '');

/** Matches any whitespace folded to a plain space. See {@link WHITESPACE_RANGES}. */
export const WHITESPACE_PATTERN = buildPattern(WHITESPACE_RANGES, 'g');

/** What a caller is told when their text carries a character that is refused. */
export const FORBIDDEN_CHARACTERS_MESSAGE = 'must not contain control characters or text direction overrides';
