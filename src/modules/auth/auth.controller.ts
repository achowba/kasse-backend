import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Types } from 'mongoose';
import { CurrentUser, type IAuthenticatedUser, Public } from '@common/auth';
import { ApiVersionEnum } from '@common/enums';
import { ErrorResponseDTO } from '@common/errors';
import { ParseObjectIdPipe } from '@common/pipes';
import { AUTH_THROTTLE_LIMIT, AUTH_THROTTLE_TTL_MS } from './auth.constants';
import { AuthService } from './auth.service';
import { AuthResponseDTO } from './dto/auth-response.dto';
import { CredentialsDTO } from './dto/credentials.dto';
import { RefreshTokenDTO } from './dto/refresh-token.dto';
import { SessionResponseDTO } from './dto/session-response.dto';

/**
 * Sessions: establishing them, renewing them, and ending them.
 *
 * @remarks
 * The credential routes are rate limited harder than the rest of the API,
 * because they are the credential stuffing surface.
 */
@ApiTags('Auth')
@ApiTooManyRequestsResponse({ description: 'Too many attempts. Wait and retry.', type: ErrorResponseDTO })
@Controller({ path: 'auth', version: ApiVersionEnum.V1 })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Registers an account and starts a session.
   *
   * @param credentials - The email and password to register.
   * @returns The new account and its first token pair.
   */
  @Public()
  @Post('signup')
  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL_MS } })
  @ApiOperation({
    summary: 'Register an account',
    description: `Creates an account and returns a token pair, so a client does not have to log in immediately afterwards.

The password must be at least 12 characters. There are no composition rules: length is what resists an offline attack, while symbol requirements mostly produce predictable substitutions. It is hashed with Argon2id and never stored, logged, or returned.

This is the only route that admits an address is already registered, because a registration form cannot be usable otherwise. Login never distinguishes an unknown address from a wrong password.`,
  })
  @ApiCreatedResponse({ description: 'The account was created and a session started.', type: AuthResponseDTO })
  @ApiConflictResponse({ description: 'The email address is already registered.', type: ErrorResponseDTO })
  async signup(@Body() credentials: CredentialsDTO): Promise<AuthResponseDTO> {
    return await this.authService.signup(credentials);
  }

  /**
   * Starts a session for existing credentials.
   *
   * @param credentials - The email and password to check.
   * @returns The account and a new token pair.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL_MS } })
  @ApiOperation({
    summary: 'Start a session',
    description: `Exchanges an email and password for a token pair.

An unknown address and a wrong password return the same 401 with the same message, and take the same amount of work, so this endpoint cannot be used to discover which addresses are registered.

Send the access token as \`Authorization: Bearer <token>\`. It is short lived; use the refresh token to get a new one rather than asking for the password again.`,
  })
  @ApiOkResponse({ description: 'The session was started.', type: AuthResponseDTO })
  @ApiUnauthorizedResponse({ description: 'The email or password is wrong.', type: ErrorResponseDTO })
  async login(@Body() credentials: CredentialsDTO): Promise<AuthResponseDTO> {
    return await this.authService.login(credentials);
  }

  /**
   * Exchanges a refresh token for a new pair.
   *
   * @param body - The refresh token to exchange.
   * @returns The account and a new token pair.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL_MS } })
  @ApiOperation({
    summary: 'Renew a session',
    description: `Exchanges a refresh token for a new access and refresh token pair.

Refresh tokens are single use. The presented token is revoked as part of the exchange, so the new one must replace it on the client. Both operations happen in one transaction, so a failure cannot leave a session without a usable refresh token.

Presenting a token that was already exchanged means the token leaked, and every session descended from that login is revoked. Both the legitimate user and whoever stole the token are signed out, which is deliberate: a noisy failure is better than a quiet ongoing compromise.

No access token is required, since the refresh token is itself the credential.`,
  })
  @ApiOkResponse({ description: 'A new token pair.', type: AuthResponseDTO })
  @ApiUnauthorizedResponse({
    description: 'The token is unknown, already used, expired, or its account no longer exists.',
    type: ErrorResponseDTO,
  })
  async refresh(@Body() body: RefreshTokenDTO): Promise<AuthResponseDTO> {
    return await this.authService.refresh(body.refreshToken);
  }

  /**
   * Ends the session a refresh token belongs to.
   *
   * @param user - The authenticated caller.
   * @param body - The refresh token to revoke.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'End the current session',
    description: `Revokes the refresh token supplied in the body, ending that session.

Idempotent: a token that is unknown, already revoked, or belongs to another account produces the same 204, because in every case the caller's intent is satisfied and the session is not active. It also means this cannot be used to probe for another account's tokens.

The access token is not revoked and remains valid until it expires, which is minutes. That is the tradeoff of stateless verification.`,
  })
  @ApiNoContentResponse({ description: 'The session is no longer active.' })
  @ApiUnauthorizedResponse({ description: 'The access token is missing, expired, or invalid.', type: ErrorResponseDTO })
  async logout(@CurrentUser() user: IAuthenticatedUser, @Body() body: RefreshTokenDTO): Promise<void> {
    await this.authService.logout(user.userId, body.refreshToken);
  }

  /**
   * Lists the caller's active sessions.
   *
   * @param user - The authenticated caller.
   * @returns The live sessions, newest first.
   */
  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List active sessions',
    description: `Returns every live, unexpired session on the account, newest first.

Sessions are identified by when they started and when they were last used, not by a device or browser name. Producing such a name means storing the user agent, and this service does not persist identifiers it does not need.`,
  })
  @ApiOkResponse({ description: 'The active sessions.', type: [SessionResponseDTO] })
  @ApiUnauthorizedResponse({ description: 'The access token is missing, expired, or invalid.', type: ErrorResponseDTO })
  async listSessions(@CurrentUser() user: IAuthenticatedUser): Promise<SessionResponseDTO[]> {
    return await this.authService.listSessions(user.userId);
  }

  /**
   * Ends every session on the account.
   *
   * @param user - The authenticated caller.
   */
  @Delete('sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'End every session',
    description: `Revokes every refresh token on the account, including the one belonging to the caller.

Ending the current session too is deliberate. The reason to press "sign out everywhere" is usually not knowing which device is compromised, and sparing the device in your hand would defeat that.

Existing access tokens stay valid until they expire, which is minutes.`,
  })
  @ApiNoContentResponse({ description: 'Every session was ended.' })
  @ApiUnauthorizedResponse({ description: 'The access token is missing, expired, or invalid.', type: ErrorResponseDTO })
  async revokeAllSessions(@CurrentUser() user: IAuthenticatedUser): Promise<void> {
    await this.authService.revokeAllSessions(user.userId);
  }

  /**
   * Ends one session.
   *
   * @param user - The authenticated caller.
   * @param sessionId - The session to end.
   */
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiParam({ name: 'sessionId', description: 'Identifier from the session list.', example: '65f1c2d3e4b5a6c7d8e9f0a1' })
  @ApiOperation({
    summary: 'End one session',
    description: `Revokes a single session by its identifier, taken from the session list.

A session belonging to another account answers 404 rather than 403, so this cannot be used to confirm that another account's session exists.`,
  })
  @ApiNoContentResponse({ description: 'The session was ended.' })
  @ApiNotFoundResponse({ description: 'No such live session on this account.', type: ErrorResponseDTO })
  @ApiUnauthorizedResponse({ description: 'The access token is missing, expired, or invalid.', type: ErrorResponseDTO })
  async revokeSession(
    @CurrentUser() user: IAuthenticatedUser,
    @Param('sessionId', ParseObjectIdPipe) sessionId: Types.ObjectId,
  ): Promise<void> {
    await this.authService.revokeSession(user.userId, sessionId);
  }
}
