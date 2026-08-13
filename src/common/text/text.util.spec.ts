import { foldForComparison, hasForbiddenCharacters, sanitiseText } from './text.util';

/**
 * Builds a string from code points.
 *
 * @remarks
 * Every character under test here is invisible, so writing them literally would
 * give a spec nobody can review and one a formatter or a careless copy could
 * silently empty. A test that lost its character would then compare `Marketing`
 * with `Marketing` and pass while asserting nothing.
 *
 * @param codePoints - The code points to build from.
 * @returns The resulting string.
 */
const chars = (...codePoints: number[]): string => String.fromCodePoint(...codePoints);

const SOFT_HYPHEN = chars(0x00ad);
const NO_BREAK_SPACE = chars(0x00a0);
const MONGOLIAN_VOWEL_SEPARATOR = chars(0x180e);
const ZERO_WIDTH_SPACE = chars(0x200b);
const ZERO_WIDTH_NON_JOINER = chars(0x200c);
const ZERO_WIDTH_JOINER = chars(0x200d);
const EM_SPACE = chars(0x2003);
const WORD_JOINER = chars(0x2060);
const IDEOGRAPHIC_SPACE = chars(0x3000);
const VARIATION_SELECTOR = chars(0xfe0e);
const BYTE_ORDER_MARK = chars(0xfeff);

const RIGHT_TO_LEFT_OVERRIDE = chars(0x202e);
const LEFT_TO_RIGHT_EMBEDDING = chars(0x202a);
const FIRST_STRONG_ISOLATE = chars(0x2068);
const POP_DIRECTIONAL_ISOLATE = chars(0x2069);
const NULL_BYTE = chars(0x0000);
const ESCAPE = chars(0x001b);
const DELETE = chars(0x007f);

const COMPOSED_CAFE = chars(0x43, 0x61, 0x66, 0xe9);
const DECOMPOSED_CAFE = chars(0x43, 0x61, 0x66, 0x65, 0x301);
const FAMILY_EMOJI = `${chars(0x1f468)}${ZERO_WIDTH_JOINER}${chars(0x1f469)}${ZERO_WIDTH_JOINER}${chars(0x1f467)}`;

describe('the fixtures themselves', () => {
  it('holds characters that are genuinely invisible', () => {
    // Guards every case below. If one of these ever became an empty string, the
    // tests would compare identical values and pass having asserted nothing.
    for (const value of [SOFT_HYPHEN, ZERO_WIDTH_SPACE, VARIATION_SELECTOR, BYTE_ORDER_MARK, ZERO_WIDTH_JOINER]) {
      expect(value.length).toBe(1);
    }

    expect(DECOMPOSED_CAFE).not.toBe(COMPOSED_CAFE);
  });
});

describe('sanitiseText', () => {
  describe('invisible characters that carry no meaning', () => {
    it.each([
      ['a variation selector', `Marketing${VARIATION_SELECTOR}`],
      ['a zero width space', `Marke${ZERO_WIDTH_SPACE}ting`],
      ['a soft hyphen', `Marke${SOFT_HYPHEN}ting`],
      ['a byte order mark, which a spreadsheet export puts first', `${BYTE_ORDER_MARK}Marketing`],
      ['a word joiner', `Marke${WORD_JOINER}ting`],
      ['a Mongolian vowel separator', `Marke${MONGOLIAN_VOWEL_SEPARATOR}ting`],
    ])('removes %s', (_label: string, value: string) => {
      expect(sanitiseText(value)).toBe('Marketing');
    });

    it('leaves nothing behind when the value is invisible from end to end', () => {
      // Why this matters: it arrived as three characters and passed a minimum
      // length rule, then stored a name nobody could see or type again.
      // Sanitising before validation makes it empty, so the length rule rejects.
      expect(sanitiseText(`${ZERO_WIDTH_SPACE}${VARIATION_SELECTOR}${SOFT_HYPHEN}`)).toBe('');
    });
  });

  describe('whitespace', () => {
    it.each([
      ['a no break space', `Marketing${NO_BREAK_SPACE}Spend`],
      ['an em space', `Marketing${EM_SPACE}Spend`],
      ['an ideographic space', `Marketing${IDEOGRAPHIC_SPACE}Spend`],
      ['a tab', 'Marketing\tSpend'],
      ['a newline, so a name stays on one line', 'Marketing\nSpend'],
    ])('folds %s to a plain space', (_label: string, value: string) => {
      expect(sanitiseText(value)).toBe('Marketing Spend');
    });

    it('collapses runs and trims the ends', () => {
      expect(sanitiseText('  Marketing   Spend  ')).toBe('Marketing Spend');
    });

    it('collapses a run left behind by removing an invisible character', () => {
      expect(sanitiseText(`Marketing ${ZERO_WIDTH_SPACE} Spend`)).toBe('Marketing Spend');
    });
  });

  describe('normalisation', () => {
    it('gives one spelling to text that can be typed two ways', () => {
      // macOS hands over the decomposed form and most other systems the
      // composed one, so the same name typed on two machines compared as
      // unequal and no user could see why.
      expect(sanitiseText(DECOMPOSED_CAFE)).toBe(sanitiseText(COMPOSED_CAFE));
    });
  });

  describe('what it keeps', () => {
    it('keeps a zero width joiner, so an emoji sequence survives', () => {
      // Removing it would split a family emoji into three separate people.
      expect(sanitiseText(`Family ${FAMILY_EMOJI}`)).toBe(`Family ${FAMILY_EMOJI}`);
    });

    it('keeps a zero width non joiner, which several scripts need to render correctly', () => {
      expect(sanitiseText(`Marke${ZERO_WIDTH_NON_JOINER}ting`)).toBe(`Marke${ZERO_WIDTH_NON_JOINER}ting`);
    });

    it('leaves ordinary text exactly as written', () => {
      expect(sanitiseText('Cloud Hosting')).toBe('Cloud Hosting');
    });

    it('does not repair a character that should be refused', () => {
      // Cleaning these would mean an attempt to smuggle a direction override was
      // silently fixed and never reported. They survive so the validator sees
      // them and the request is answered 400.
      expect(sanitiseText(`Marketing${RIGHT_TO_LEFT_OVERRIDE}`)).toBe(`Marketing${RIGHT_TO_LEFT_OVERRIDE}`);
    });
  });
});

describe('hasForbiddenCharacters', () => {
  it.each([
    ['a null byte', `Marke${NULL_BYTE}ting`],
    ['an escape', `Marketing${ESCAPE}`],
    ['a delete', `Marketing${DELETE}`],
    ['a right to left override', `Marketing${RIGHT_TO_LEFT_OVERRIDE}`],
    ['a left to right embedding', `${LEFT_TO_RIGHT_EMBEDDING}Marketing`],
    ['a directional isolate', `${FIRST_STRONG_ISOLATE}Marketing${POP_DIRECTIONAL_ISOLATE}`],
  ])('refuses %s', (_label: string, value: string) => {
    expect(hasForbiddenCharacters(value)).toBe(true);
  });

  it.each([
    ['plain text', 'Cloud Hosting'],
    ['a tab, which is folded instead', 'Marketing\tSpend'],
    ['a newline, which is folded instead', 'Marketing\nSpend'],
    ['a variation selector, which is removed instead', `Marketing${VARIATION_SELECTOR}`],
    ['an accent', COMPOSED_CAFE],
    ['an emoji', `Food ${chars(0x1f355)}`],
  ])('accepts %s', (_label: string, value: string) => {
    expect(hasForbiddenCharacters(value)).toBe(false);
  });

  it('does not carry state between calls', () => {
    // A pattern with the global flag remembers lastIndex, so the same input
    // would answer true and then false. This asserts the flag was left off.
    const value = `Marketing${RIGHT_TO_LEFT_OVERRIDE}`;

    expect(hasForbiddenCharacters(value)).toBe(true);
    expect(hasForbiddenCharacters(value)).toBe(true);
  });
});

describe('foldForComparison', () => {
  it('folds an accent, so Café and Cafe are one category to a person choosing', () => {
    expect(foldForComparison(COMPOSED_CAFE)).toBe('cafe');
    expect(foldForComparison('Cafe')).toBe('cafe');
  });

  it('gives the same key to both spellings of the same accented name', () => {
    expect(foldForComparison(DECOMPOSED_CAFE)).toBe(foldForComparison(COMPOSED_CAFE));
  });

  it('strips the joiners a display name keeps', () => {
    // The whole reason a key is more aggressive than a stored name. Left in,
    // these are two categories that no reader could tell apart.
    expect(foldForComparison(`Marke${ZERO_WIDTH_NON_JOINER}ting`)).toBe('marketing');
    expect(foldForComparison(`Marke${ZERO_WIDTH_JOINER}ting`)).toBe('marketing');
  });

  it('ignores case', () => {
    expect(foldForComparison('CLOUD hosting')).toBe(foldForComparison('cloud Hosting'));
  });

  it('keeps a non Latin script rather than emptying it', () => {
    expect(foldForComparison(chars(0x411, 0x44e, 0x434, 0x436, 0x435, 0x442))).toBe(
      chars(0x431, 0x44e, 0x434, 0x436, 0x435, 0x442),
    );
  });
});
