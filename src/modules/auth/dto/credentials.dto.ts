import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { MAXIMUM_EMAIL_LENGTH, MAXIMUM_PASSWORD_LENGTH, MINIMUM_PASSWORD_LENGTH } from '../auth.constants';

/**
 * Email and password, used by both signup and login.
 *
 * @remarks
 * One shape for both, because they take the same input and any difference
 * between them would be a place for the two to drift apart.
 *
 * No composition rules beyond length. Requiring symbols and digits pushes people
 * toward predictable substitutions, while length is what actually resists an
 * offline attack. The upper bound exists so one request cannot ask the hasher to
 * chew through an unbounded input.
 *
 * @property email - The login address. Stored and matched lowercase.
 * @property password - The password. Never logged, never stored, never returned.
 */
export class CredentialsDTO {
  @ApiProperty({ description: 'Login address.', example: 'finance@acme.test', format: 'email', maxLength: MAXIMUM_EMAIL_LENGTH })
  @IsEmail()
  @MaxLength(MAXIMUM_EMAIL_LENGTH)
  email!: string;

  @ApiProperty({
    description: `Password. At least ${String(MINIMUM_PASSWORD_LENGTH)} characters. No composition rules: length is what resists an offline attack.`,
    example: 'correct horse battery staple',
    minLength: MINIMUM_PASSWORD_LENGTH,
    maxLength: MAXIMUM_PASSWORD_LENGTH,
    format: 'password',
  })
  @IsString()
  @MinLength(MINIMUM_PASSWORD_LENGTH)
  @MaxLength(MAXIMUM_PASSWORD_LENGTH)
  password!: string;
}
