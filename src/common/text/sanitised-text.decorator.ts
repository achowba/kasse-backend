import { applyDecorators } from '@nestjs/common';
import { Transform, TransformFnParams } from 'class-transformer';
import { Matches } from 'class-validator';
import { FORBIDDEN_CHARACTER_PATTERN, FORBIDDEN_CHARACTERS_MESSAGE } from './text.constants';
import { sanitiseText } from './text.util';

/**
 * Cleans a free text field and refuses the characters that cannot be cleaned.
 *
 * @remarks
 * Put this on any field a person types into. It does not replace `@IsString`,
 * `@MinLength`, or `@MaxLength`; it runs before them and hands them the value
 * that will actually be stored.
 *
 * The order is the point. `class-transformer` runs first, so the length rules
 * see the sanitised text. A name of three no break spaces becomes an empty
 * string and fails `@MinLength(1)`, where before it passed as three characters
 * and was stored as a name nobody could see or type again.
 *
 * That example was first written here with the literal characters in it, and the
 * lint rule against irregular whitespace rejected the file. Which makes the
 * point twice: describe these characters, do not paste them.
 *
 * The refusal is expressed as "every character is acceptable" rather than "some
 * character is not", because `Matches` tests a value against a pattern and there
 * is no negated form. The two patterns are built from the same table, so they
 * cannot drift apart.
 *
 * A non string value passes through untouched, leaving `@IsString` to produce
 * the error. Reporting a type problem as a character problem would send the
 * caller looking in the wrong place.
 *
 * @returns The composed transform and validation decorators.
 */
export const SanitisedText = (): PropertyDecorator =>
  applyDecorators(
    Transform(({ value }: TransformFnParams): unknown => (typeof value === 'string' ? sanitiseText(value) : value)),
    Matches(buildAcceptablePattern(), { message: `$property ${FORBIDDEN_CHARACTERS_MESSAGE}` }),
  );

/**
 * Builds the "contains none of the refused characters" pattern.
 *
 * @remarks
 * Derived from {@link FORBIDDEN_CHARACTER_PATTERN} by negating its character
 * class, so the list of refused characters is written down once. Hand writing
 * the negated twin is how the two quietly stop agreeing.
 *
 * @returns A pattern matching only text with no refused character.
 */
function buildAcceptablePattern(): RegExp {
  const characterClass = FORBIDDEN_CHARACTER_PATTERN.source.slice(1, -1);

  return new RegExp(`^[^${characterClass}]*$`, 'u');
}
