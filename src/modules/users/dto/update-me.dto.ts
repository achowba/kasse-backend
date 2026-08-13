import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrencyEnum } from '@common/enums';
import { FIRST_MONTH, LAST_MONTH } from '../users.constants';

/**
 * The account settings a user may change.
 *
 * @remarks
 * Deliberately narrow. Email is not changeable here because it is the login
 * identity and moving it needs a verification flow. Nothing about the password
 * is here either.
 *
 * @property currency - ISO 4217 code every amount on this account uses.
 * @property fiscalYearStartMonth - Month the fiscal year starts, 1 through 12.
 */
export class UpdateMeDTO {
  @ApiPropertyOptional({
    description: 'Currency the account is denominated in. Changing it relabels existing amounts, it does not convert them.',
    enum: CurrencyEnum,
    example: CurrencyEnum.AED,
  })
  @IsOptional()
  @IsEnum(CurrencyEnum)
  currency?: CurrencyEnum;

  @ApiPropertyOptional({
    description: 'Month the fiscal year starts. 1 is January, which makes the fiscal year the calendar year.',
    example: 4,
    minimum: FIRST_MONTH,
    maximum: LAST_MONTH,
  })
  @IsOptional()
  @IsInt()
  @Min(FIRST_MONTH)
  @Max(LAST_MONTH)
  fiscalYearStartMonth?: number;
}
