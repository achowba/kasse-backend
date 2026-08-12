import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDTO } from '@modules/users';

/**
 * A newly established or refreshed session.
 *
 * @remarks
 * Tokens are returned in the body rather than set as cookies, because the API is
 * client agnostic: a mobile or desktop caller has no cookie jar. The client
 * decides where to keep them.
 *
 * @property accessToken - Short lived JWT. Send it as `Authorization: Bearer <token>`.
 * @property expiresIn - Seconds until the access token expires, so a client can refresh before it does.
 * @property refreshToken - Long lived opaque token. Exchange it for a new pair; it is single use.
 * @property user - The account the session belongs to.
 */
export class AuthResponseDTO {
  @ApiProperty({
    description: 'Short lived access token. Send as `Authorization: Bearer <token>`.',
    example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;

  @ApiProperty({ description: 'Seconds until the access token expires.', example: 900 })
  expiresIn!: number;

  @ApiProperty({
    description:
      'Long lived refresh token. Single use: exchanging it returns a new pair and invalidates this one. Presenting it twice revokes every session descended from this login.',
    example: 'V2hhdCBhIGxvdmVseSBkYXkgZm9yIGEgcmVmcmVzaCB0b2tlbg',
  })
  refreshToken!: string;

  @ApiProperty({ description: 'The account this session belongs to.', type: UserResponseDTO })
  user!: UserResponseDTO;
}
