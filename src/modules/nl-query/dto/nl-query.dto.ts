import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { MissingActualPolicyEnum } from '@common/money';
import { ReportResponseDTO } from '@modules/reports';
import { MAX_QUESTION_LENGTH } from '../nl-query.constants';

/**
 * A question about spending.
 *
 * @property question - The question, in plain language.
 */
export class NlQueryDTO {
  @ApiProperty({
    description: 'A question about spending, in plain language.',
    example: 'How did marketing do in Q1 2026?',
    maxLength: MAX_QUESTION_LENGTH,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_QUESTION_LENGTH)
  question!: string;
}

/**
 * How the question was read.
 *
 * @remarks
 * Returned alongside the data rather than kept internal, because a user has to be
 * able to see that "last quarter" was taken to mean the months they meant. An
 * answer with no visible interpretation is one the reader has to trust blindly.
 *
 * @property interpretation - One sentence restating the question as it was understood.
 * @property from - First month the report covers.
 * @property to - Last month the report covers.
 * @property categories - The categories it was narrowed to, empty for all of them.
 * @property missingActuals - The policy applied to months with nothing logged.
 */
export class NlQueryFilterDTO {
  @ApiProperty({
    description: 'One sentence restating the question as it was understood.',
    example: 'Marketing spend against plan for January to March 2026.',
  })
  interpretation!: string;

  @ApiProperty({ description: 'First month the report covers.', example: '2026-01' })
  from!: string;

  @ApiProperty({ description: 'Last month the report covers.', example: '2026-03' })
  to!: string;

  @ApiProperty({ description: 'Categories it was narrowed to. Empty means every category.', type: [String] })
  categories!: string[];

  @ApiPropertyOptional({ description: 'The policy applied to months with nothing logged.', enum: MissingActualPolicyEnum })
  missingActuals?: MissingActualPolicyEnum;
}

/**
 * The answer to a question.
 *
 * @property question - The question as asked.
 * @property filter - How it was read.
 * @property report - The report that filter produced.
 */
export class NlQueryResponseDTO {
  @ApiProperty({ description: 'The question as asked.', example: 'How did marketing do in Q1 2026?' })
  question!: string;

  @ApiProperty({ description: 'How the question was read.', type: NlQueryFilterDTO })
  filter!: NlQueryFilterDTO;

  @ApiProperty({ description: 'The report that filter produced.', type: ReportResponseDTO })
  report!: ReportResponseDTO;
}
