import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** A base64url encoded 32 byte token is 43 characters. Bound it either side of that. */
const MINIMUM_TOKEN_LENGTH = 20;
const MAXIMUM_TOKEN_LENGTH = 200;

/**
 * A refresh token presented for exchange or revocation.
 *
 * @property refreshToken - The token issued by signup, login, or a previous refresh.
 */
export class RefreshTokenDTO {
  @ApiProperty({
    description: 'The refresh token issued by signup, login, or a previous refresh.',
    example: 'V2hhdCBhIGxvdmVseSBkYXkgZm9yIGEgcmVmcmVzaCB0b2tlbg',
    minLength: MINIMUM_TOKEN_LENGTH,
    maxLength: MAXIMUM_TOKEN_LENGTH,
  })
  @IsString()
  @MinLength(MINIMUM_TOKEN_LENGTH)
  @MaxLength(MAXIMUM_TOKEN_LENGTH)
  refreshToken!: string;
}
