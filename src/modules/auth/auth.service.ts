import { ConflictException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { withTransaction } from '@common/database';
import { AuditActionEnum, AuditEntityEnum, AuditLogService } from '@modules/audit-log';
import { UserDocument, UserResponseDTO, UsersService } from '@modules/users';
import { INVALID_CREDENTIALS } from './auth.constants';
import { AuthResponseDTO } from './dto/auth-response.dto';
import { ChangePasswordDTO } from './dto/change-password.dto';
import { CredentialsDTO } from './dto/credentials.dto';
import { SessionResponseDTO } from './dto/session-response.dto';
import { PasswordService } from './password.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { TokenService } from './token.service';

/**
 * Signup, login, token rotation, and session management.
 *
 * @remarks
 * The session model, and why it is shaped this way:
 *
 * - The **access token** is a short lived RS256 JWT. It is verified with the
 *   public key on every request without touching the database, which keeps the
 *   hot path cheap. The cost of that is that it cannot be revoked before it
 *   expires, which is why it is short lived.
 * - The **refresh token** is opaque random data stored only as a hash. It is long
 *   lived, so it must be revocable, and revocation needs a record anyway.
 * - Every refresh **rotates**: the presented token is revoked and a new one
 *   issued in the same family. A token therefore works exactly once.
 * - Presenting an already rotated token means the chain leaked, so the whole
 *   family is revoked. A thief who uses a stolen token locks out both parties,
 *   which is loud, and loud is better than a quiet ongoing compromise.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly auditLogService: AuditLogService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * Registers an account and starts a session.
   *
   * @steps
   * 1. Reject the address when it already belongs to a live account.
   * 2. Hash the password, which is deliberately slow.
   * 3. Create the account.
   * 4. Issue the first token pair, so a client is signed in without a second
   *    round trip to login.
   *
   * @param credentials - The email and password to register.
   * @returns The new account and its first token pair.
   * @throws ConflictException When the address already belongs to a live account.
   */
  async signup(credentials: CredentialsDTO): Promise<AuthResponseDTO> {
    if (await this.usersService.isEmailTaken(credentials.email)) {
      // Signup is the one place the API admits an address is taken, because a
      // registration form has to say so to be usable. Login never does.
      throw new ConflictException('That email address is already registered.');
    }

    const passwordHash = await this.passwordService.hash(credentials.password);
    const user = await this.usersService.create(credentials.email, passwordHash);

    this.logger.log({ userId: user._id.toString() }, 'account created');

    return await this.establishSession(user);
  }

  /**
   * Starts a session for existing credentials.
   *
   * @remarks
   * An unknown address and a wrong password produce the same message, and the
   * unknown address path still runs a hash. Returning early would make a missing
   * account measurably faster to reject and turn the endpoint into an address
   * oracle.
   *
   * @steps
   * 1. Look the address up.
   * 2. When there is no account, hash the supplied password anyway and reject.
   *    The hash is the whole point of this step: it costs what a real check
   *    costs, so both paths take the same time.
   * 3. Verify the password against the stored hash and reject on mismatch, with
   *    the same message as step 2.
   * 4. Issue a token pair.
   *
   * @param credentials - The email and password to check.
   * @returns The account and a new token pair.
   * @throws UnauthorizedException When the credentials do not match.
   */
  async login(credentials: CredentialsDTO): Promise<AuthResponseDTO> {
    const user = await this.usersService.findByEmail(credentials.email);

    if (user === null) {
      await this.passwordService.hash(credentials.password);

      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (!(await this.passwordService.verify(user.passwordHash, credentials.password))) {
      this.logger.log({ userId: user._id.toString() }, 'login rejected: wrong password');

      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return await this.establishSession(user);
  }

  /**
   * Exchanges a refresh token for a new pair.
   *
   * @remarks
   * The revoke and the issue run in one transaction, so a failure between them
   * cannot leave a session with no usable refresh token.
   *
   * @steps
   * 1. Hash the presented token and look the record up by that hash. The token
   *    itself is never stored, so this is the only way to find it.
   * 2. Reject an unknown token.
   * 3. When the token was already revoked, treat it as a leak: revoke the entire
   *    family and reject. This check comes before the expiry check on purpose,
   *    because a replayed token that has also expired is still a leak.
   * 4. Reject an expired token.
   * 5. Reject when the account behind it is gone.
   * 6. In one transaction, retire the presented token and issue a new pair in the
   *    same family.
   *
   * @param presentedToken - The refresh token as presented by the client.
   * @returns The account and a new token pair.
   * @throws UnauthorizedException When the token is unknown, already used, expired, or its account is gone.
   */
  async refresh(presentedToken: string): Promise<AuthResponseDTO> {
    const tokenHash = this.tokenService.hashRefreshToken(presentedToken);
    const record = await this.refreshTokensRepository.findByHash(tokenHash);

    if (record === null) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (record.revokedAt !== null) {
      const revokedCount = await this.refreshTokensRepository.revokeFamily(record.userId, record.familyId);

      this.logger.warn(
        { userId: record.userId.toString(), revokedCount },
        'refresh token reuse detected, revoked the whole token family',
      );

      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired.');
    }

    const user = await this.usersService.findById(record.userId);

    if (user === null) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    return await withTransaction(this.connection, async (session: ClientSession): Promise<AuthResponseDTO> => {
      await this.refreshTokensRepository.markUsed(record._id, session);
      await this.refreshTokensRepository.revoke(record.userId, record._id, session);

      return await this.establishSession(user, record.familyId, session);
    });
  }

  /**
   * Ends the session a refresh token belongs to.
   *
   * @remarks
   * Scoped to the caller: a token belonging to someone else is treated as if it
   * did not exist, so this cannot be used to end another account's sessions.
   *
   * @param userId - The authenticated caller.
   * @param presentedToken - The refresh token to revoke.
   */
  async logout(userId: Types.ObjectId, presentedToken: string): Promise<void> {
    const tokenHash = this.tokenService.hashRefreshToken(presentedToken);
    const record = await this.refreshTokensRepository.findByHash(tokenHash);

    if (record === null || !record.userId.equals(userId)) {
      // Already gone, or never theirs. Logout is idempotent either way: the
      // caller wanted the session ended, and it is not active.
      return;
    }

    await this.refreshTokensRepository.revoke(userId, record._id);
  }

  /**
   * Lists the caller's active sessions.
   *
   * @param userId - The authenticated caller.
   * @returns The live, unexpired sessions, newest first.
   */
  async listSessions(userId: Types.ObjectId): Promise<SessionResponseDTO[]> {
    const sessions = await this.refreshTokensRepository.listActive(userId);

    return sessions.map((session) => SessionResponseDTO.fromDocument(session));
  }

  /**
   * Ends one of the caller's sessions.
   *
   * @param userId - The authenticated caller.
   * @param sessionId - The session to end.
   * @throws NotFoundException When the caller has no such live session.
   */
  async revokeSession(userId: Types.ObjectId, sessionId: Types.ObjectId): Promise<void> {
    const revoked = await this.refreshTokensRepository.revoke(userId, sessionId);

    if (!revoked) {
      throw new NotFoundException('Session not found.');
    }
  }

  /**
   * Ends every session the caller has, including the current one.
   *
   * @remarks
   * Deliberately includes the current session. "Sign out everywhere" that quietly
   * spares the device you are holding is the wrong answer when the reason for
   * pressing it is that you do not know which device is compromised.
   *
   * @param userId - The authenticated caller.
   * @returns How many sessions were ended.
   */
  async revokeAllSessions(userId: Types.ObjectId): Promise<number> {
    const revokedCount = await this.refreshTokensRepository.revokeAll(userId);

    this.logger.log({ userId: userId.toString(), revokedCount }, 'all sessions revoked');

    return revokedCount;
  }

  /**
   * Replaces the caller's password and cuts off every session but this one.
   *
   * @remarks
   * The current password is required even though the caller already holds a
   * valid access token, and that is the point rather than a formality. A token
   * can be lifted from an unlocked machine, and a change that needed only a
   * token would let a borrowed session become a permanent one by locking the
   * owner out of their own account. Knowing the current password is the only
   * evidence here that the person asking is the account holder.
   *
   * Every refresh token is revoked, including the caller's, and a new pair is
   * issued in the same breath. Changing a password is the thing people do
   * **because** they think someone else has access, so leaving other devices
   * signed in would defeat the reason for doing it. Issuing a fresh pair means
   * the caller stays signed in and everybody else is cut off, which is the
   * behaviour a user expects without having to be told.
   *
   * A wrong current password is reported as `INVALID_CREDENTIALS`, the same text
   * login uses. There is no account enumeration risk here, since the caller is
   * already authenticated, but reusing the message keeps one answer for one
   * situation.
   *
   * @steps
   * 1. Load the account and verify the current password against its hash.
   * 2. Hash the new password with the same parameters signup uses.
   * 3. Store it.
   * 4. Revoke every refresh token the account has.
   * 5. Issue a fresh pair, so this caller alone remains signed in.
   * 6. Record the change, without either password.
   *
   * @param userId - The authenticated caller.
   * @param input - The current password and its replacement.
   * @param requestId - The request making the change.
   * @returns A new token pair.
   * @throws UnauthorizedException When the current password does not match.
   */
  async changePassword(userId: Types.ObjectId, input: ChangePasswordDTO, requestId?: string): Promise<AuthResponseDTO> {
    const user = await this.usersService.getById(userId);

    if (!(await this.passwordService.verify(user.passwordHash, input.currentPassword))) {
      this.logger.log({ userId: userId.toString() }, 'password change rejected: wrong current password');

      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.usersService.updatePassword(userId, await this.passwordService.hash(input.newPassword));

    const revokedCount = await this.refreshTokensRepository.revokeAll(userId);

    this.logger.log({ userId: userId.toString(), revokedCount }, 'password changed, sessions revoked');

    this.auditLogService.record({
      userId,
      action: AuditActionEnum.PASSWORD_CHANGED,
      entity: AuditEntityEnum.USER,
      entityId: userId,
      // Neither password, old or new, and no hash. The entry records that it
      // happened and what it cost the account's other sessions.
      after: { sessionsRevoked: revokedCount },
      requestId,
    });

    return await this.establishSession(user);
  }

  /**
   * Issues a token pair and records the refresh token.
   *
   * @steps
   * 1. Sign a short lived access token.
   * 2. Generate an opaque refresh token, which returns the token and its hash.
   * 3. Store only the hash, under the continuing family or a new one.
   * 4. Return the token itself, which is the only moment it exists outside the
   *    client.
   *
   * @param user - The account the session belongs to.
   * @param familyId - The rotation chain to continue. Omitted starts a new chain, which is what a fresh login does.
   * @param session - Optional transaction session.
   * @returns The tokens and the account.
   */
  private async establishSession(
    user: UserDocument,
    familyId?: Types.ObjectId,
    session?: ClientSession,
  ): Promise<AuthResponseDTO> {
    const { accessToken, expiresIn } = await this.tokenService.issueAccessToken(user._id);
    const refresh = this.tokenService.createRefreshToken();

    await this.refreshTokensRepository.issue(
      user._id,
      refresh.tokenHash,
      familyId ?? new Types.ObjectId(),
      refresh.expiresAt,
      session,
    );

    return {
      accessToken,
      expiresIn,
      refreshToken: refresh.token,
      user: UserResponseDTO.fromDocument(user),
    };
  }
}
