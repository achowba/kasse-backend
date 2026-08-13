import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { MAXIMUM_PASSWORD_LENGTH, MINIMUM_PASSWORD_LENGTH } from '../auth.constants';

/**
 * A password change by someone who already knows the current one.
 *
 * @remarks
 * The current password is required, and that is the whole security model here.
 * An access token alone is not enough: a token can be lifted from a machine
 * somebody walked away from, and letting it change the password would turn a
 * borrowed session into a permanent one by locking the owner out of their own
 * account.
 *
 * This is not a reset. Recovering a password nobody knows needs a token sent to
 * an address, which needs an email transport this deployment does not have. The
 * README says so rather than half building it.
 *
 * @property currentPassword - The password on the account now.
 * @property newPassword - The password to replace it with.
 */
export class ChangePasswordDTO {
  @ApiProperty({
    description: 'The password currently on the account. Required even though the caller is already authenticated.',
    format: 'password',
    minLength: MINIMUM_PASSWORD_LENGTH,
    maxLength: MAXIMUM_PASSWORD_LENGTH,
  })
  @IsString()
  @MinLength(MINIMUM_PASSWORD_LENGTH)
  @MaxLength(MAXIMUM_PASSWORD_LENGTH)
  currentPassword!: string;

  @ApiProperty({
    description: 'The new password. Same rules as signup: length is the single strongest factor, so the floor is high.',
    format: 'password',
    minLength: MINIMUM_PASSWORD_LENGTH,
    maxLength: MAXIMUM_PASSWORD_LENGTH,
  })
  @IsString()
  @MinLength(MINIMUM_PASSWORD_LENGTH)
  @MaxLength(MAXIMUM_PASSWORD_LENGTH)
  newPassword!: string;
}
