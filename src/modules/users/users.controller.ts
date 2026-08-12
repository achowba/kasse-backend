import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type IAuthenticatedUser } from '@common/auth';
import { ApiVersionEnum } from '@common/enums';
import { ErrorResponseDTO } from '@common/errors';
import { UpdateMeDTO } from './dto/update-me.dto';
import { UserResponseDTO } from './dto/user-response.dto';
import { UsersService } from './users.service';

/**
 * The signed in account.
 *
 * @remarks
 * Everything here acts on the caller's own account, taken from the access token.
 * There is no route that takes a user id, so one account cannot address another.
 */
@ApiTags('Account')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'The access token is missing, expired, or invalid.', type: ErrorResponseDTO })
@Controller({ path: 'me', version: ApiVersionEnum.V1 })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Returns the signed in account.
   *
   * @param user - The authenticated caller.
   * @returns The account.
   */
  @Get()
  @ApiOperation({
    summary: 'Read the signed in account',
    description:
      'Returns the account the access token belongs to, including the currency and fiscal year start that reports are computed against. The password hash is never returned.',
  })
  @ApiOkResponse({ description: 'The signed in account.', type: UserResponseDTO })
  @ApiNotFoundResponse({ description: 'The account no longer exists.', type: ErrorResponseDTO })
  async getMe(@CurrentUser() user: IAuthenticatedUser): Promise<UserResponseDTO> {
    const account = await this.usersService.getById(user.userId);

    return UserResponseDTO.fromDocument(account);
  }

  /**
   * Changes the settings a user is allowed to change.
   *
   * @param user - The authenticated caller.
   * @param changes - The settings to change.
   * @returns The updated account.
   */
  @Patch()
  @ApiOperation({
    summary: 'Update account settings',
    description: `Changes the currency or the month the fiscal year starts in. Both are optional; anything omitted is left alone.

Changing the currency relabels amounts rather than converting them. Amounts are stored as minor units with no currency of their own, so existing plans and expenses keep their numeric value.

The email address is not changeable here, because it is the login identity and moving it needs a verification flow.`,
  })
  @ApiOkResponse({ description: 'The updated account.', type: UserResponseDTO })
  @ApiNotFoundResponse({ description: 'The account no longer exists.', type: ErrorResponseDTO })
  async updateMe(@CurrentUser() user: IAuthenticatedUser, @Body() changes: UpdateMeDTO): Promise<UserResponseDTO> {
    const account = await this.usersService.updateSettings(user.userId, changes);

    return UserResponseDTO.fromDocument(account);
  }
}
