import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Connection, Types } from 'mongoose';
import { CurrencyEnum } from '@common/enums';
import { AuditActionEnum, AuditLogService } from '@modules/audit-log';
import { UserDocument, UsersService } from '@modules/users';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { RefreshTokenDocument } from './schemas/refresh-token.schema';
import { TokenService } from './token.service';

/** Stand in for a stored account, carrying every field the response mapper reads. */
const buildUser = (id = new Types.ObjectId(), email = 'finance@acme.test'): UserDocument =>
  ({
    _id: id,
    email,
    passwordHash: '$argon2id$stored',
    currency: CurrencyEnum.USD,
    fiscalYearStartMonth: 1,
    createdAt: new Date('2026-01-15T10:04:11.212Z'),
    updatedAt: new Date('2026-01-15T10:04:11.212Z'),
    deletedAt: null,
  }) as UserDocument;

/** Stand in for a stored refresh token record. */
const buildTokenRecord = (overrides: Partial<RefreshTokenDocument> = {}): RefreshTokenDocument =>
  ({
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    familyId: new Types.ObjectId(),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    lastUsedAt: null,
    ...overrides,
  }) as RefreshTokenDocument;

describe('AuthService', () => {
  let usersService: jest.Mocked<
    Pick<UsersService, 'isEmailTaken' | 'create' | 'findByEmail' | 'findById' | 'getById' | 'updatePassword' | 'updateEmail'>
  >;
  let passwordService: jest.Mocked<Pick<PasswordService, 'hash' | 'verify'>>;
  let auditLog: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let tokenService: jest.Mocked<Pick<TokenService, 'issueAccessToken' | 'createRefreshToken' | 'hashRefreshToken'>>;
  let refreshTokens: jest.Mocked<
    Pick<RefreshTokensRepository, 'findByHash' | 'issue' | 'revoke' | 'revokeFamily' | 'revokeAll' | 'listActive' | 'markUsed'>
  >;
  let service: AuthService;

  beforeEach(() => {
    usersService = {
      isEmailTaken: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue(buildUser()),
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(buildUser()),
      getById: jest.fn().mockResolvedValue(buildUser()),
      updatePassword: jest.fn().mockResolvedValue(undefined),
      updateEmail: jest.fn().mockResolvedValue(buildUser(undefined, 'moved@acme.test')),
    };

    auditLog = { record: jest.fn() };

    passwordService = {
      hash: jest.fn().mockResolvedValue('$argon2id$new'),
      verify: jest.fn().mockResolvedValue(true),
    };

    tokenService = {
      issueAccessToken: jest.fn().mockResolvedValue({ accessToken: 'signed.jwt', expiresIn: 900 }),
      createRefreshToken: jest.fn().mockReturnValue({ token: 'plain-token', tokenHash: 'hashed-token', expiresAt: new Date() }),
      hashRefreshToken: jest.fn().mockReturnValue('hashed-token'),
    };

    refreshTokens = {
      findByHash: jest.fn().mockResolvedValue(null),
      issue: jest.fn().mockResolvedValue(buildTokenRecord()),
      revoke: jest.fn().mockResolvedValue(true),
      revokeFamily: jest.fn().mockResolvedValue(2),
      revokeAll: jest.fn().mockResolvedValue(3),
      listActive: jest.fn().mockResolvedValue([]),
      markUsed: jest.fn().mockResolvedValue(undefined),
    };

    // Runs the unit of work immediately, so the transaction is transparent here.
    const connection = {
      startSession: jest.fn().mockResolvedValue({
        withTransaction: jest.fn(async (work: () => Promise<unknown>) => await work()),
        endSession: jest.fn().mockResolvedValue(undefined),
      }),
    } as unknown as Connection;

    service = new AuthService(
      usersService as unknown as UsersService,
      passwordService,
      tokenService as unknown as TokenService,
      refreshTokens as unknown as RefreshTokensRepository,
      auditLog as unknown as AuditLogService,
      connection,
    );
  });

  describe('signup', () => {
    it('hashes the password and never passes the plaintext on', async () => {
      await service.signup({ email: 'finance@acme.test', password: 'correct horse battery staple' });

      expect(passwordService.hash).toHaveBeenCalledWith('correct horse battery staple');
      expect(usersService.create).toHaveBeenCalledWith('finance@acme.test', '$argon2id$new');
    });

    it('rejects an address that is already registered', async () => {
      usersService.isEmailTaken.mockResolvedValue(true);

      await expect(service.signup({ email: 'taken@acme.test', password: 'correct horse battery' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('starts a new token family, since a signup is a fresh chain', async () => {
      await service.signup({ email: 'finance@acme.test', password: 'correct horse battery staple' });

      expect(refreshTokens.issue).toHaveBeenCalledTimes(1);
    });
  });

  describe('login', () => {
    it('still hashes when the address is unknown, so timing does not reveal it', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.login({ email: 'nobody@acme.test', password: 'some password here' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      // The work is what matters: returning early would make a missing account
      // measurably faster to reject and turn this into an address oracle.
      expect(passwordService.hash).toHaveBeenCalledWith('some password here');
    });

    it('rejects a wrong password', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());
      passwordService.verify.mockResolvedValue(false);

      await expect(service.login({ email: 'finance@acme.test', password: 'wrong password here' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('gives the same message whether the address is unknown or the password is wrong', async () => {
      const unknownAddress = await service
        .login({ email: 'nobody@acme.test', password: 'some password' })
        .catch((error: Error) => error.message);

      usersService.findByEmail.mockResolvedValue(buildUser());
      passwordService.verify.mockResolvedValue(false);

      const wrongPassword = await service
        .login({ email: 'finance@acme.test', password: 'some password' })
        .catch((error: Error) => error.message);

      expect(unknownAddress).toBe(wrongPassword);
    });

    it('issues a session for correct credentials', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());

      const result = await service.login({ email: 'finance@acme.test', password: 'correct horse battery' });

      expect(result.accessToken).toBe('signed.jwt');
      expect(result.refreshToken).toBe('plain-token');
      expect(result.expiresIn).toBe(900);
    });
  });

  describe('refresh', () => {
    it('rejects a token it has never seen', async () => {
      refreshTokens.findByHash.mockResolvedValue(null);

      await expect(service.refresh('unknown')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('revokes the whole family when an already used token is presented', async () => {
      const record = buildTokenRecord({ revokedAt: new Date() });

      refreshTokens.findByHash.mockResolvedValue(record);

      await expect(service.refresh('replayed')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(refreshTokens.revokeFamily).toHaveBeenCalledWith(record.userId, record.familyId);
    });

    it('rejects an expired token without revoking the family', async () => {
      refreshTokens.findByHash.mockResolvedValue(buildTokenRecord({ expiresAt: new Date(Date.now() - 1_000) }));

      await expect(service.refresh('stale')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(refreshTokens.revokeFamily).not.toHaveBeenCalled();
    });

    it('rejects a token whose account is gone', async () => {
      refreshTokens.findByHash.mockResolvedValue(buildTokenRecord());
      usersService.findById.mockResolvedValue(null);

      await expect(service.refresh('orphaned')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rotates within the same family, so reuse remains detectable', async () => {
      const record = buildTokenRecord();

      refreshTokens.findByHash.mockResolvedValue(record);

      await service.refresh('valid');

      expect(refreshTokens.revoke).toHaveBeenCalledWith(record.userId, record._id, expect.anything());
      expect(refreshTokens.issue).toHaveBeenCalledWith(
        expect.anything(),
        'hashed-token',
        record.familyId,
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('logout', () => {
    it('does nothing for a token it has never seen', async () => {
      refreshTokens.findByHash.mockResolvedValue(null);

      await service.logout(new Types.ObjectId(), 'unknown');

      expect(refreshTokens.revoke).not.toHaveBeenCalled();
    });

    it('refuses to revoke a token belonging to another account', async () => {
      refreshTokens.findByHash.mockResolvedValue(buildTokenRecord({ userId: new Types.ObjectId() }));

      await service.logout(new Types.ObjectId(), 'someone-elses');

      expect(refreshTokens.revoke).not.toHaveBeenCalled();
    });

    it('revokes the caller’s own token', async () => {
      const userId = new Types.ObjectId();
      const record = buildTokenRecord({ userId });

      refreshTokens.findByHash.mockResolvedValue(record);

      await service.logout(userId, 'mine');

      expect(refreshTokens.revoke).toHaveBeenCalledWith(userId, record._id);
    });
  });

  describe('sessions', () => {
    it('reports nothing when there are no live sessions', async () => {
      await expect(service.listSessions(new Types.ObjectId())).resolves.toEqual([]);
    });

    it('raises a not found when revoking a session that is not the caller’s', async () => {
      refreshTokens.revoke.mockResolvedValue(false);

      await expect(service.revokeSession(new Types.ObjectId(), new Types.ObjectId())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reports how many sessions ending everything revoked', async () => {
      await expect(service.revokeAllSessions(new Types.ObjectId())).resolves.toBe(3);
    });
  });

  describe('changeEmail', () => {
    const change = { currentPassword: 'the current password', newEmail: 'moved@acme.test' };

    it('rejects a wrong current password, because the address is the login identity', async () => {
      passwordService.verify.mockResolvedValue(false);

      await expect(service.changeEmail(new Types.ObjectId(), change)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('writes nothing when the current password is wrong', async () => {
      passwordService.verify.mockResolvedValue(false);

      await expect(service.changeEmail(new Types.ObjectId(), change)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersService.updateEmail).not.toHaveBeenCalled();
    });

    it('lowercases and trims before writing, so one address cannot become two', async () => {
      const userId = new Types.ObjectId();

      usersService.getById.mockResolvedValue(buildUser(userId));

      await service.changeEmail(userId, { ...change, newEmail: '  Moved@Acme.test  ' });

      expect(usersService.updateEmail).toHaveBeenCalledWith(userId, 'moved@acme.test');
    });

    it('turns a duplicate key into a conflict rather than a server error', async () => {
      // Uniqueness is decided by the index, not by asking first, because a check
      // and then a write is two operations with a gap between them.
      usersService.updateEmail.mockRejectedValue({ code: 11_000 });

      await expect(service.changeEmail(new Types.ObjectId(), change)).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not swallow a failure that is not a duplicate', async () => {
      usersService.updateEmail.mockRejectedValue(new Error('connection lost'));

      await expect(service.changeEmail(new Types.ObjectId(), change)).rejects.toThrow('connection lost');
    });

    it('changes nothing when asked for the address it already has', async () => {
      const user = buildUser();

      usersService.getById.mockResolvedValue(user);

      const result = await service.changeEmail(user._id, { ...change, newEmail: user.email });

      // Answering 409 against their own account would be a confusing way to say
      // "no change needed".
      expect(usersService.updateEmail).not.toHaveBeenCalled();
      expect(result.accessToken).toBeDefined();
    });

    it('keeps every other session, unlike a password change', async () => {
      await service.changeEmail(new Types.ObjectId(), change);

      // No credential changed, so ending every session would be disruption
      // without a security reason.
      expect(refreshTokens.revokeAll).not.toHaveBeenCalled();
    });

    it('records both sides of the change, without the password', async () => {
      const user = buildUser();

      usersService.getById.mockResolvedValue(user);
      usersService.updateEmail.mockResolvedValue(buildUser(user._id, 'moved@acme.test'));

      await service.changeEmail(user._id, change, 'req-4');

      const entry = auditLog.record.mock.calls[0]?.[0];

      expect(entry).toEqual(
        expect.objectContaining({
          action: AuditActionEnum.EMAIL_CHANGED,
          before: { email: user.email },
          after: { email: 'moved@acme.test' },
          requestId: 'req-4',
        }),
      );
      expect(JSON.stringify(entry)).not.toContain('password');
    });
  });

  describe('changePassword', () => {
    const change = { currentPassword: 'the current password', newPassword: 'a brand new password' };

    it('rejects a wrong current password, even though the caller is authenticated', async () => {
      // The whole security model of this route. A token can be lifted from an
      // unlocked machine, and a change needing only a token would turn a
      // borrowed session into a permanent one.
      passwordService.verify.mockResolvedValue(false);

      await expect(service.changePassword(new Types.ObjectId(), change)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('writes nothing when the current password is wrong', async () => {
      passwordService.verify.mockResolvedValue(false);

      await expect(service.changePassword(new Types.ObjectId(), change)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersService.updatePassword).not.toHaveBeenCalled();
      expect(refreshTokens.revokeAll).not.toHaveBeenCalled();
    });

    it('verifies against the stored hash rather than anything supplied', async () => {
      const user = buildUser();

      usersService.getById.mockResolvedValue(user);

      await service.changePassword(user._id, change);

      expect(passwordService.verify).toHaveBeenCalledWith(user.passwordHash, 'the current password');
    });

    it('stores a hash of the new password and never the password', async () => {
      const userId = new Types.ObjectId();

      usersService.getById.mockResolvedValue(buildUser(userId));

      await service.changePassword(userId, change);

      expect(passwordService.hash).toHaveBeenCalledWith('a brand new password');
      expect(usersService.updatePassword).toHaveBeenCalledWith(userId, '$argon2id$new');
    });

    it('revokes every refresh token, including the caller’s own', async () => {
      const userId = new Types.ObjectId();

      usersService.getById.mockResolvedValue(buildUser(userId));

      await service.changePassword(userId, change);

      // Changing a password is what people do when they believe somebody else
      // has access, so sparing other devices would defeat the reason for it.
      expect(refreshTokens.revokeAll).toHaveBeenCalledWith(userId);
    });

    it('returns a fresh pair, so the caller is not signed out by their own change', async () => {
      const result = await service.changePassword(new Types.ObjectId(), change);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('records the change without either password or any hash', async () => {
      await service.changePassword(new Types.ObjectId(), change, 'req-9');

      const entry = auditLog.record.mock.calls[0]?.[0];

      expect(entry).toEqual(
        expect.objectContaining({ action: AuditActionEnum.PASSWORD_CHANGED, requestId: 'req-9', after: { sessionsRevoked: 3 } }),
      );
      expect(JSON.stringify(entry)).not.toContain('password');
      expect(JSON.stringify(entry)).not.toContain('argon2');
    });
  });
});
