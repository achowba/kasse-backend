import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { MAXIMUM_EMAIL_LENGTH, MAXIMUM_PASSWORD_LENGTH, MINIMUM_PASSWORD_LENGTH } from '../auth.constants';

/**
 * A change of login address by somebody who knows the current password.
 *
 * @remarks
 * The password is required, and for a sharper reason than on a password change.
 * The address **is** the login identity: whoever holds it is who the account
 * belongs to, and changing it with a borrowed access token would hand the
 * account over. It is the single most valuable field on the record to an
 * attacker, so it is the one that most needs proof beyond a token.
 *
 * The new address is **not verified**. Confirming that somebody can receive mail
 * at an address needs a token sent to it, which needs an email transport this
 * deployment has no provider for. Recorded in the README rather than half built.
 *
 * @property currentPassword - The password on the account now.
 * @property newEmail - The address to move the account to.
 */
export class ChangeEmailDTO {
  @ApiProperty({
    description:
      'The password currently on the account. Required: the address is the login identity, so a token alone is not enough.',
    format: 'password',
    minLength: MINIMUM_PASSWORD_LENGTH,
    maxLength: MAXIMUM_PASSWORD_LENGTH,
  })
  @IsString()
  @MinLength(MINIMUM_PASSWORD_LENGTH)
  @MaxLength(MAXIMUM_PASSWORD_LENGTH)
  currentPassword!: string;

  @ApiProperty({
    description: 'The new login address. Stored and matched lowercase, and not verified.',
    example: 'finance@acme.test',
    format: 'email',
    maxLength: MAXIMUM_EMAIL_LENGTH,
  })
  @IsEmail()
  @MaxLength(MAXIMUM_EMAIL_LENGTH)
  newEmail!: string;
}
