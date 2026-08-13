import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { TokenService } from './token.service';

/** Seconds in a day, for asserting the refresh expiry. */
const SECONDS_PER_DAY = 86_400;

describe('TokenService', () => {
  const nowSeconds = Math.floor(Date.now() / 1_000);

  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync' | 'decode'>>;
  let service: TokenService;

  beforeEach(() => {
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
      decode: jest.fn().mockReturnValue({ sub: 'user', exp: nowSeconds + 900 }),
    };

    const configService = {
      getOrThrow: jest.fn().mockReturnValue({ refreshTtlDays: 7 }),
    } as unknown as ConfigService;

    service = new TokenService(jwtService as unknown as JwtService, configService);
  });

  describe('issueAccessToken', () => {
    it('signs the account id as the subject, with the address alongside it', async () => {
      const userId = new Types.ObjectId();

      await service.issueAccessToken(userId, 'demo@kasse.app');

      // The address is attribution, not authorisation. It lets a log line name
      // the account without a database read; every query is still scoped by the
      // subject.
      expect(jwtService.signAsync).toHaveBeenCalledWith({ sub: userId.toString(), email: 'demo@kasse.app' });
    });

    it('reports the lifetime from the signed token rather than from configuration', async () => {
      // Reading it back from the token is what stops the number a client is given
      // drifting from the claim the token actually carries.
      const { expiresIn } = await service.issueAccessToken(new Types.ObjectId(), 'demo@kasse.app');

      expect(expiresIn).toBeGreaterThan(880);
      expect(expiresIn).toBeLessThanOrEqual(900);
    });

    it('reports zero rather than a negative lifetime when the token carries no expiry', async () => {
      jwtService.decode.mockReturnValue({ sub: 'user' });

      await expect(service.issueAccessToken(new Types.ObjectId(), 'demo@kasse.app')).resolves.toMatchObject({ expiresIn: 0 });
    });
  });

  describe('createRefreshToken', () => {
    it('never returns the same token twice', () => {
      const tokens = new Set(Array.from({ length: 50 }, () => service.createRefreshToken().token));

      expect(tokens.size).toBe(50);
    });

    it('returns a hash that matches the token, so it can be looked up later', () => {
      const { token, tokenHash } = service.createRefreshToken();

      expect(service.hashRefreshToken(token)).toBe(tokenHash);
    });

    it('never returns the token itself as the stored value', () => {
      const { token, tokenHash } = service.createRefreshToken();

      expect(tokenHash).not.toBe(token);
      expect(tokenHash).toHaveLength(64);
    });

    it('expires after the configured number of days', () => {
      const { expiresAt } = service.createRefreshToken();
      const secondsAway = (expiresAt.getTime() - Date.now()) / 1_000;

      expect(secondsAway).toBeGreaterThan(7 * SECONDS_PER_DAY - 10);
      expect(secondsAway).toBeLessThanOrEqual(7 * SECONDS_PER_DAY);
    });

    it('produces a URL safe token, since it travels in a JSON body and headers', () => {
      const { token } = service.createRefreshToken();

      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('hashRefreshToken', () => {
    it('is deterministic, which is what makes lookup by hash possible', () => {
      expect(service.hashRefreshToken('a-token')).toBe(service.hashRefreshToken('a-token'));
    });

    it('differs for different tokens', () => {
      expect(service.hashRefreshToken('one')).not.toBe(service.hashRefreshToken('two'));
    });
  });
});
