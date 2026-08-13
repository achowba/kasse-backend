import { plainToInstance } from 'class-transformer';
import { IsString, MaxLength, MinLength, validateSync } from 'class-validator';
import { SanitisedText } from './sanitised-text.decorator';

/**
 * Builds a string from code points.
 *
 * @param codePoints - The code points to build from.
 * @returns The resulting string.
 */
const chars = (...codePoints: number[]): string => String.fromCodePoint(...codePoints);

const ZERO_WIDTH_SPACE = chars(0x200b);
const NO_BREAK_SPACE = chars(0x00a0);
const RIGHT_TO_LEFT_OVERRIDE = chars(0x202e);
const NULL_BYTE = chars(0x0000);

/**
 * A field carrying the decorator, wired the way a real DTO wires it.
 *
 * @remarks
 * The length rules are here on purpose. What is being tested is not only that
 * the value is cleaned, but that it is cleaned **before** they run.
 *
 * @property name - Free text a person typed.
 */
class TextFixtureDTO {
  @SanitisedText()
  @IsString()
  @MinLength(1)
  @MaxLength(12)
  name!: string;
}

/**
 * Runs a value through transformation and validation, as the pipe does.
 *
 * @param value - The raw value, as it would arrive in a request body.
 * @returns The transformed instance and any validation failures.
 */
const submit = (value: unknown): { instance: TextFixtureDTO; failures: string[] } => {
  const instance = plainToInstance(TextFixtureDTO, { name: value });
  const failures = validateSync(instance).flatMap((error) => Object.values(error.constraints ?? {}));

  return { instance, failures };
};

describe('SanitisedText', () => {
  describe('cleaning', () => {
    it('removes an invisible character before the value is stored', () => {
      expect(submit(`Marke${ZERO_WIDTH_SPACE}ting`).instance.name).toBe('Marketing');
    });

    it('folds an unusual space and trims', () => {
      expect(submit(`  Board${NO_BREAK_SPACE}Travel  `).instance.name).toBe('Board Travel');
    });

    it('leaves ordinary text alone', () => {
      expect(submit('Marketing').instance.name).toBe('Marketing');
    });
  });

  describe('running before the length rules', () => {
    it('rejects a value that is only invisible characters, which used to pass as three', () => {
      const { instance, failures } = submit(`${ZERO_WIDTH_SPACE}${ZERO_WIDTH_SPACE}${ZERO_WIDTH_SPACE}`);

      // The whole reason this is a transform rather than a check. Before, the
      // length rule counted three characters and a name nobody could see was
      // stored. Now it counts none.
      expect(instance.name).toBe('');
      expect(failures.join(' ')).toContain('longer than or equal to');
    });

    it('measures length after cleaning, not before', () => {
      // Thirteen characters in, twelve once the invisible one is gone, so a rule
      // capping the field at twelve has to see the cleaned value to accept it.
      expect(submit(`Board Trave${ZERO_WIDTH_SPACE}l`).failures).toEqual([]);
    });
  });

  describe('refusing what cannot be cleaned', () => {
    it.each([
      ['a text direction override', `Board${RIGHT_TO_LEFT_OVERRIDE}`],
      ['a null byte', `Board${NULL_BYTE}`],
    ])('reports %s', (_label: string, value: string) => {
      const { failures } = submit(value);

      expect(failures.join(' ')).toContain('must not contain control characters');
    });

    it('names the property in the message, so a client can point at the field', () => {
      expect(submit(`Board${RIGHT_TO_LEFT_OVERRIDE}`).failures.join(' ')).toContain('name');
    });

    it('accepts text that carries none of them', () => {
      expect(submit('Board Travel').failures).toEqual([]);
    });
  });

  describe('a value that is not text', () => {
    it('passes it through untouched and lets the type rule report it', () => {
      // Reporting a type problem as a character problem would send the caller
      // looking in the wrong place.
      const { instance, failures } = submit(42);

      expect(instance.name).toBe(42);
      expect(failures.join(' ')).toContain('must be a string');
    });
  });
});
