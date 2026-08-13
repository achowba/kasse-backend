import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { bootstrapNestServer } from '../src/bootstrap';

/**
 * A token pair, narrowed from supertest's untyped body.
 *
 * @property accessToken - The signed access token.
 * @property refreshToken - The opaque refresh token.
 * @property expiresIn - Seconds until the access token expires.
 * @property user - The account the session belongs to.
 */
interface IAuthBody {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string; currency: string; fiscalYearStartMonth: number };
}

/** A password comfortably over the minimum length. */
const PASSWORD = 'correct horse battery staple';

/**
 * Builds an address unique to one test, so tests cannot collide through the
 * unique index on email.
 *
 * @param label - Something identifying the test.
 * @returns A unique email address.
 */
const emailFor = (label: string): string => `${label}-${String(process.hrtime.bigint())}@example.test`;

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // The rate limits are raised by the global setup rather than being disabled
    // here. Overriding the guard does not work: it is registered through the
    // APP_GUARD token, so replacing the class leaves the registration in place.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    bootstrapNestServer(app);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = (): Server => app.getHttpServer() as Server;

  /**
   * Registers a fresh account.
   *
   * @param label - Something identifying the calling test.
   * @returns The token pair and account.
   */
  const signup = async (label: string): Promise<IAuthBody> => {
    const response = await request(server())
      .post('/api/v1/auth/signup')
      .send({ email: emailFor(label), password: PASSWORD })
      .expect(201);

    return response.body as IAuthBody;
  };

  describe('signup', () => {
    it('creates an account and returns a usable session', async () => {
      const body = await signup('signup');

      expect(body.accessToken.length).toBeGreaterThan(0);
      expect(body.refreshToken.length).toBeGreaterThan(0);
      expect(body.expiresIn).toBeGreaterThan(0);
      expect(body.user.currency).toBe('USD');
      expect(body.user.fiscalYearStartMonth).toBe(1);
    });

    it('never returns the password or its hash', async () => {
      const response = await request(server())
        .post('/api/v1/auth/signup')
        .send({ email: emailFor('leak'), password: PASSWORD })
        .expect(201);

      const serialised = JSON.stringify(response.body);

      expect(serialised).not.toContain(PASSWORD);
      expect(serialised).not.toContain('passwordHash');
      expect(serialised).not.toContain('$argon2');
    });

    it('rejects an address that is already registered', async () => {
      const email = emailFor('duplicate');

      await request(server()).post('/api/v1/auth/signup').send({ email, password: PASSWORD }).expect(201);
      await request(server()).post('/api/v1/auth/signup').send({ email, password: PASSWORD }).expect(409);
    });

    it('rejects a password below the minimum length', async () => {
      await request(server())
        .post('/api/v1/auth/signup')
        .send({ email: emailFor('short'), password: 'short' })
        .expect(400);
    });

    it('rejects an unknown property rather than ignoring it', async () => {
      // The validation pipe forbids non-whitelisted properties, so a client
      // cannot smuggle a field the DTO does not declare.
      await request(server())
        .post('/api/v1/auth/signup')
        .send({ email: emailFor('extra'), password: PASSWORD, isAdmin: true })
        .expect(400);
    });
  });

  describe('login', () => {
    it('starts a session for correct credentials', async () => {
      const email = emailFor('login');

      await request(server()).post('/api/v1/auth/signup').send({ email, password: PASSWORD }).expect(201);

      const response = await request(server()).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);

      expect((response.body as IAuthBody).accessToken.length).toBeGreaterThan(0);
    });

    it('gives the same answer for a wrong password and an unknown address', async () => {
      const email = emailFor('wrong');

      await request(server()).post('/api/v1/auth/signup').send({ email, password: PASSWORD }).expect(201);

      const wrongPassword = await request(server())
        .post('/api/v1/auth/login')
        .send({ email, password: 'a completely different password' })
        .expect(401);

      const unknownAddress = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: emailFor('nobody'), password: PASSWORD })
        .expect(401);

      const wrongBody = wrongPassword.body as { message: string; code: string };
      const unknownBody = unknownAddress.body as { message: string; code: string };

      expect(wrongBody.message).toBe(unknownBody.message);
      expect(wrongBody.code).toBe(unknownBody.code);
    });

    it('matches the address case insensitively', async () => {
      const email = emailFor('case');

      await request(server()).post('/api/v1/auth/signup').send({ email, password: PASSWORD }).expect(201);
      await request(server()).post('/api/v1/auth/login').send({ email: email.toUpperCase(), password: PASSWORD }).expect(200);
    });
  });

  describe('the access token', () => {
    it('is required by a protected route', async () => {
      await request(server()).get('/api/v1/me').expect(401);
    });

    it('grants access to the account it belongs to', async () => {
      const { accessToken, user } = await signup('access');

      const response = await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`).expect(200);

      expect((response.body as { id: string }).id).toBe(user.id);
    });

    it('is rejected when tampered with, since the signature no longer verifies', async () => {
      const { accessToken } = await signup('tamper');
      const tampered = `${accessToken.slice(0, -3)}abc`;

      await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${tampered}`).expect(401);
    });

    it('is rejected when it is not a token at all', async () => {
      await request(server()).get('/api/v1/me').set('Authorization', 'Bearer not-a-token').expect(401);
    });
  });

  describe('refresh and rotation', () => {
    it('exchanges a refresh token for a new pair', async () => {
      const { refreshToken } = await signup('refresh');

      const response = await request(server()).post('/api/v1/auth/refresh').send({ refreshToken }).expect(200);

      const body = response.body as IAuthBody;

      expect(body.refreshToken).not.toBe(refreshToken);
      expect(body.accessToken.length).toBeGreaterThan(0);
    });

    it('refuses the old token once it has been exchanged', async () => {
      const { refreshToken } = await signup('rotate');

      await request(server()).post('/api/v1/auth/refresh').send({ refreshToken }).expect(200);
      await request(server()).post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
    });

    it('revokes the whole family when a used token is presented again', async () => {
      const { refreshToken: first } = await signup('reuse');

      const rotated = await request(server()).post('/api/v1/auth/refresh').send({ refreshToken: first }).expect(200);
      const second = (rotated.body as IAuthBody).refreshToken;

      // Replaying the first token means the chain leaked.
      await request(server()).post('/api/v1/auth/refresh').send({ refreshToken: first }).expect(401);

      // The legitimate token is now dead too. That is the point: both parties are
      // signed out rather than the thief keeping quiet access.
      await request(server()).post('/api/v1/auth/refresh').send({ refreshToken: second }).expect(401);
    });

    it('rejects an unknown refresh token', async () => {
      await request(server())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'a'.repeat(43) })
        .expect(401);
    });
  });

  describe('sessions', () => {
    it('lists a session per login', async () => {
      const email = emailFor('sessions');

      const created = await request(server()).post('/api/v1/auth/signup').send({ email, password: PASSWORD }).expect(201);

      await request(server()).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);

      const { accessToken } = created.body as IAuthBody;
      const response = await request(server())
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const sessions = response.body as { id: string; lastUsedAt: string | null }[];

      expect(sessions).toHaveLength(2);
      expect(sessions[0]?.lastUsedAt).toBeNull();
    });

    it('never exposes the token hash', async () => {
      const { accessToken } = await signup('hash');

      const response = await request(server())
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain('tokenHash');
    });

    it('ends one session, after which its refresh token stops working', async () => {
      const { accessToken, refreshToken } = await signup('revoke-one');

      const listed = await request(server())
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const sessionId = (listed.body as { id: string }[])[0]?.id;

      await request(server())
        .delete(`/api/v1/auth/sessions/${String(sessionId)}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await request(server()).post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
    });

    it('answers 404 for a session id that is not the caller’s', async () => {
      const mine = await signup('mine');
      const theirs = await signup('theirs');

      const listed = await request(server())
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${theirs.accessToken}`)
        .expect(200);

      const theirSessionId = (listed.body as { id: string }[])[0]?.id;

      // 404 rather than 403: confirming the session exists would leak.
      await request(server())
        .delete(`/api/v1/auth/sessions/${String(theirSessionId)}`)
        .set('Authorization', `Bearer ${mine.accessToken}`)
        .expect(404);
    });

    it('rejects a malformed session id as a bad request, not a server error', async () => {
      const { accessToken } = await signup('malformed');

      await request(server())
        .delete('/api/v1/auth/sessions/not-an-object-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('ends every session, including the caller’s own', async () => {
      const email = emailFor('revoke-all');

      const first = await request(server()).post('/api/v1/auth/signup').send({ email, password: PASSWORD }).expect(201);

      const second = await request(server()).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);

      const firstBody = first.body as IAuthBody;
      const secondBody = second.body as IAuthBody;

      await request(server()).delete('/api/v1/auth/sessions').set('Authorization', `Bearer ${firstBody.accessToken}`).expect(204);

      await request(server()).post('/api/v1/auth/refresh').send({ refreshToken: firstBody.refreshToken }).expect(401);
      await request(server()).post('/api/v1/auth/refresh').send({ refreshToken: secondBody.refreshToken }).expect(401);
    });
  });

  describe('logout', () => {
    it('ends the session the refresh token belongs to', async () => {
      const { accessToken, refreshToken } = await signup('logout');

      await request(server())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(204);

      await request(server()).post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
    });

    it('is idempotent, and silent about another account’s token', async () => {
      const mine = await signup('logout-mine');
      const theirs = await signup('logout-theirs');

      await request(server())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${mine.accessToken}`)
        .send({ refreshToken: theirs.refreshToken })
        .expect(204);

      // Their session is untouched: the request said nothing about whether that
      // token existed, and did not act on it.
      await request(server()).post('/api/v1/auth/refresh').send({ refreshToken: theirs.refreshToken }).expect(200);
    });
  });

  describe('account settings', () => {
    it('updates the currency and fiscal year start', async () => {
      const { accessToken } = await signup('settings');

      const response = await request(server())
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currency: 'AED', fiscalYearStartMonth: 4 })
        .expect(200);

      const body = response.body as { currency: string; fiscalYearStartMonth: number };

      expect(body.currency).toBe('AED');
      expect(body.fiscalYearStartMonth).toBe(4);
    });

    it('rejects a fiscal year start outside 1 through 12', async () => {
      const { accessToken } = await signup('bad-month');

      await request(server())
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fiscalYearStartMonth: 13 })
        .expect(400);
    });
  });

  describe('changing a password', () => {
    const NEW_PASSWORD = 'a replacement password';

    /**
     * Changes the password on an account.
     *
     * @param accessToken - The caller's access token.
     * @param currentPassword - The password to prove identity with.
     * @param newPassword - The replacement.
     * @returns The supertest response.
     */
    const changePassword = (accessToken: string, currentPassword: string, newPassword: string): request.Test =>
      request(server())
        .patch('/api/v1/auth/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword, newPassword });

    it('refuses without an access token', async () => {
      await request(server())
        .patch('/api/v1/auth/password')
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(401);
    });

    it('refuses a wrong current password even though the token is valid', async () => {
      const { accessToken } = await signup('wrong-current');

      const response = await changePassword(accessToken, 'not the current password', NEW_PASSWORD).expect(401);

      expect((response.body as { code: string }).code).toBe('UNAUTHENTICATED');
    });

    it('leaves the old password working when the change is refused', async () => {
      const { user, accessToken } = await signup('refused-change');

      await changePassword(accessToken, 'not the current password', NEW_PASSWORD).expect(401);

      // A refusal that had quietly written the new hash would be far worse than
      // the refusal itself.
      await request(server()).post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
    });

    it('rejects a new password below the length floor', async () => {
      const { accessToken } = await signup('short-new');

      const response = await changePassword(accessToken, PASSWORD, 'short').expect(400);

      // The same floor signup enforces. A change route that accepted a weaker
      // password than registration would quietly undo the rule.
      expect((response.body as { code: string }).code).toBe('VALIDATION_FAILED');
    });

    it('changes the password and returns a usable new pair', async () => {
      const { accessToken } = await signup('happy-change');

      const response = await changePassword(accessToken, PASSWORD, NEW_PASSWORD).expect(200);
      const body = response.body as IAuthBody;

      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();

      // The returned token has to work, or the caller is signed out by their own
      // password change, which is the thing the fresh pair exists to prevent.
      await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${body.accessToken}`).expect(200);
    });

    it('makes the new password the one that logs in, and retires the old', async () => {
      const { user, accessToken } = await signup('login-after-change');

      await changePassword(accessToken, PASSWORD, NEW_PASSWORD).expect(200);

      await request(server()).post('/api/v1/auth/login').send({ email: user.email, password: NEW_PASSWORD }).expect(200);
      await request(server()).post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD }).expect(401);
    });

    it('kills every other session, which is the point of doing it', async () => {
      const { user, accessToken } = await signup('kills-sessions');

      // A second device, signed in before the change.
      const other = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
      const otherRefreshToken = (other.body as IAuthBody).refreshToken;

      await changePassword(accessToken, PASSWORD, NEW_PASSWORD).expect(200);

      // Changing a password is what somebody does when they think another
      // person has access. A device left signed in would defeat that entirely.
      await request(server()).post('/api/v1/auth/refresh').send({ refreshToken: otherRefreshToken }).expect(401);
    });

    it('retires the refresh token the caller held before the change', async () => {
      const { refreshToken, accessToken } = await signup('own-token-dies');

      await changePassword(accessToken, PASSWORD, NEW_PASSWORD).expect(200);

      await request(server()).post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
    });

    it('records the change in the audit log without either password', async () => {
      const { accessToken } = await signup('audited-change');

      const changed = await changePassword(accessToken, PASSWORD, NEW_PASSWORD).expect(200);
      const fresh = (changed.body as IAuthBody).accessToken;

      const audit = await request(server()).get('/api/v1/audit-log?limit=10').set('Authorization', `Bearer ${fresh}`).expect(200);

      const entries = (audit.body as { items: { action: string }[] }).items;

      expect(entries.some((entry) => entry.action === 'PASSWORD_CHANGED')).toBe(true);
      expect(JSON.stringify(entries)).not.toContain(NEW_PASSWORD);
      expect(JSON.stringify(entries)).not.toContain(PASSWORD);
    });
  });
});
