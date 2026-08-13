import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsMongoId, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { MissingActualPolicyEnum } from '@common/money';
import { MONTH_PATTERN } from '@common/month';
import { PaginationQueryDTO } from '@common/pagination';
import { MAX_FISCAL_YEAR, MIN_FISCAL_YEAR } from '../reports.constants';

/**
 * The range and shape of a report.
 *
 * @remarks
 * `from` and `to` are required rather than defaulted. A report over an unbounded
 * range is a table scan whose size grows with the account's history, and a client
 * that forgot the range would get one silently.
 *
 * @property from - First month of the range, inclusive. Required unless `fiscalYear` is given.
 * @property to - Last month of the range, inclusive. Required unless `fiscalYear` is given.
 * @property fiscalYear - A fiscal year, resolved to a range through the account's fiscal year start.
 * @property categoryIds - Restrict to these categories. Every category when absent.
 * @property missingActuals - How to report a category and month with a target but nothing logged.
 */
export class ReportQueryDTO extends PaginationQueryDTO {
  @ApiPropertyOptional({
    description: 'First month of the range, inclusive. Required unless `fiscalYear` is given.',
    example: '2026-01',
  })
  @IsOptional()
  @IsString()
  @Matches(MONTH_PATTERN, { message: 'from must be in YYYY-MM format' })
  from?: string;

  @ApiPropertyOptional({
    description: 'Last month of the range, inclusive. Required unless `fiscalYear` is given.',
    example: '2026-02',
  })
  @IsOptional()
  @IsString()
  @Matches(MONTH_PATTERN, { message: 'to must be in YYYY-MM format' })
  to?: string;

  @ApiPropertyOptional({
    description:
      'A fiscal year, resolved to its twelve months through this account’s `fiscalYearStartMonth`. With a start month of 4, `fiscalYear=2026` means 2026-04 through 2027-03. Takes precedence over `from` and `to`.',
    example: 2026,
    minimum: 1970,
    maximum: 2999,
  })
  @IsOptional()
  // Arrives from a query string, so it is a string until something converts it.
  @Type(() => Number)
  @IsInt()
  @Min(MIN_FISCAL_YEAR)
  @Max(MAX_FISCAL_YEAR)
  fiscalYear?: number;

  @ApiPropertyOptional({
    description: 'Restrict to these categories. Repeat the parameter, or send one comma separated value.',
    example: ['65f1c2d3e4b5a6c7d8e9f0a1'],
    type: [String],
  })
  @IsOptional()
  // A query string carries one value or many with no way to tell which was meant,
  // so a single id arrives as a string and a repeated one as an array. Normalising
  // here means the service only ever sees a list.
  @Transform(({ value }: { value: unknown }): string[] => {
    if (Array.isArray(value)) {
      return value as string[];
    }

    return typeof value === 'string' ? value.split(',').filter((part: string) => part !== '') : [];
  })
  @IsMongoId({ each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({
    description:
      'How to report a category and month with a target but nothing logged. `zero` treats it as 0 spent, so the variance is the whole target. `null` reports the actual, variance, and percent as null, so a client can render a dash.',
    enum: MissingActualPolicyEnum,
    default: MissingActualPolicyEnum.ZERO,
  })
  @IsOptional()
  @IsEnum(MissingActualPolicyEnum)
  missingActuals?: MissingActualPolicyEnum;
}
