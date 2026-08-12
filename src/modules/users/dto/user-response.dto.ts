import { ApiProperty } from '@nestjs/swagger';
import { CurrencyEnum } from '@common/enums';
import { UserDocument } from '../schemas/user.schema';

/**
 * An account, as returned to its owner.
 *
 * @remarks
 * Built explicitly from the document rather than returned from it, so a field
 * added to the schema later cannot leak into a response by accident. The password
 * hash is never part of this shape.
 *
 * @property id - Identifier of the account.
 * @property email - Login address.
 * @property currency - ISO 4217 code every amount on this account uses.
 * @property fiscalYearStartMonth - Month the fiscal year starts, 1 through 12.
 * @property createdAt - When the account was created.
 */
export class UserResponseDTO {
  @ApiProperty({ description: 'Identifier of the account.', example: '65f1c2d3e4b5a6c7d8e9f0a1' })
  id!: string;

  @ApiProperty({ description: 'Login address.', example: 'finance@acme.test', format: 'email' })
  email!: string;

  @ApiProperty({
    description: 'Currency every amount on this account is denominated in.',
    enum: CurrencyEnum,
    example: CurrencyEnum.USD,
  })
  currency!: CurrencyEnum;

  @ApiProperty({
    description: 'Month the fiscal year starts. January means the fiscal year is the calendar year.',
    example: 1,
    minimum: 1,
    maximum: 12,
  })
  fiscalYearStartMonth!: number;

  @ApiProperty({ description: 'When the account was created.', example: '2026-01-15T10:04:11.212Z', format: 'date-time' })
  createdAt!: string;

  /**
   * Maps a stored account onto the response shape.
   *
   * @param user - The account document.
   * @returns The account, without anything a client must not see.
   */
  static fromDocument(user: UserDocument): UserResponseDTO {
    return {
      id: user._id.toString(),
      email: user.email,
      currency: user.currency,
      fiscalYearStartMonth: user.fiscalYearStartMonth,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
