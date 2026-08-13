import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { bootstrapNestServer } from '../src/bootstrap';

/**
 * A category as the API returns it.
 *
 * @property id - Identifier used by every other endpoint.
 * @property name - The name as the owner wrote it.
 * @property shared - Whether it comes from the seeded catalogue.
 * @property archived - Whether it is hidden from pickers.
 */
interface ICategoryBody {
  id: string;
  name: string;
  shared: boolean;
  archived: boolean;
}

/**
 * The error envelope, narrowed from supertest's untyped body.
 *
 * @property code - The stable code a client branches on.
 * @property message - What a user is told.
 */
interface IErrorBody {
  code: string;
  message: string;
}

/**
 * Category ownership, end to end against a real MongoDB.
 *
 * @remarks
 * Every rule here is about which rows a query may reach, and a unit test with a
 * mocked repository cannot show that. It asserts the calls the service made, not
 * what the database would have matched, so a filter that quietly stopped
 * excluding `userId: null` would keep every unit test green.
 *
 * These read back through the API after each attempt for the same reason. A
 * rejected status code proves the request was refused; only reading the row
 * again proves nothing was written.
 */
describe('Categories (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let otherAccessToken: string;
  let sharedCategoryId: string;
  let sharedCategoryName: string;

  const auth = (): string => `Bearer ${accessToken}`;
  const otherAuth = (): string => `Bearer ${otherAccessToken}`;
  const server = (): Server => app.getHttpServer() as Server;

  /**
   * Lists everything the main test account can see.
   *
   * @returns The visible categories.
   */
  const listCategories = async (): Promise<ICategoryBody[]> => {
    const response = await request(server()).get('/api/v1/categories?limit=200').set('Authorization', auth()).expect(200);

    return (response.body as { items: ICategoryBody[] }).items;
  };

  /**
   * Registers an account and returns its access token.
   *
   * @param label - Distinguishes the address from the other account's.
   * @returns The access token.
   */
  const signUp = async (label: string): Promise<string> => {
    const response = await request(server())
      .post('/api/v1/auth/signup')
      .send({ email: `categories-${label}-${Date.now()}@example.com`, password: 'a-long-enough-password' })
      .expect(201);

    return (response.body as { accessToken: string }).accessToken;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    bootstrapNestServer(app);
    await app.init();

    accessToken = await signUp('owner');
    otherAccessToken = await signUp('other');

    const shared = (await listCategories()).find((category) => category.shared);

    if (shared === undefined) {
      throw new Error('The shared catalogue was not seeded, so there is nothing to test against.');
    }

    sharedCategoryId = shared.id;
    sharedCategoryName = shared.name;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('the seeded catalogue is readable by everyone', () => {
    it('lists shared entries alongside the account’s own', async () => {
      const categories = await listCategories();

      expect(categories.some((category) => category.shared)).toBe(true);
    });

    it('shows the same shared entry to a different account', async () => {
      const response = await request(server()).get('/api/v1/categories?limit=200').set('Authorization', otherAuth()).expect(200);

      const visible = (response.body as { items: ICategoryBody[] }).items;

      expect(visible.some((category) => category.id === sharedCategoryId)).toBe(true);
    });
  });

  describe('the seeded catalogue cannot be changed by anyone', () => {
    it('refuses to rename a shared category, and says why rather than denying it exists', async () => {
      const response = await request(server())
        .patch(`/api/v1/categories/${sharedCategoryId}`)
        .set('Authorization', auth())
        .send({ name: 'Hijacked' })
        .expect(403);

      expect((response.body as IErrorBody).code).toBe('FORBIDDEN');
    });

    it('refuses to archive a shared category', async () => {
      await request(server())
        .patch(`/api/v1/categories/${sharedCategoryId}`)
        .set('Authorization', auth())
        .send({ archived: true })
        .expect(403);
    });

    it('refuses to delete a shared category', async () => {
      await request(server()).delete(`/api/v1/categories/${sharedCategoryId}`).set('Authorization', auth()).expect(403);
    });

    it('leaves the shared category untouched after every attempt', async () => {
      // The point of the whole block. A 403 shows the request was refused; only
      // reading the row back shows nothing reached the database.
      const shared = (await listCategories()).find((category) => category.id === sharedCategoryId);

      expect(shared).toEqual({ id: sharedCategoryId, name: sharedCategoryName, shared: true, archived: false });
    });
  });

  describe('an account owns what it creates', () => {
    let ownId: string;

    it('creates one, marked as not shared', async () => {
      const response = await request(server())
        .post('/api/v1/categories')
        .set('Authorization', auth())
        .send({ name: 'Team Offsites' })
        .expect(201);

      const created = response.body as ICategoryBody;

      ownId = created.id;

      expect(created).toEqual({ id: ownId, name: 'Team Offsites', shared: false, archived: false });
    });

    it('renames its own', async () => {
      const response = await request(server())
        .patch(`/api/v1/categories/${ownId}`)
        .set('Authorization', auth())
        .send({ name: 'Company Offsites' })
        .expect(200);

      expect((response.body as ICategoryBody).name).toBe('Company Offsites');
    });

    it('archives and restores its own', async () => {
      await request(server())
        .patch(`/api/v1/categories/${ownId}`)
        .set('Authorization', auth())
        .send({ archived: true })
        .expect(200);

      await request(server())
        .patch(`/api/v1/categories/${ownId}`)
        .set('Authorization', auth())
        .send({ archived: false })
        .expect(200);
    });

    it('hides it from another account entirely', async () => {
      // Not 403. Confirming it exists would reveal that another account holds
      // it, so this is answered exactly like an id that never existed.
      const response = await request(server())
        .patch(`/api/v1/categories/${ownId}`)
        .set('Authorization', otherAuth())
        .send({ name: 'Stolen' })
        .expect(404);

      expect((response.body as IErrorBody).code).toBe('NOT_FOUND');
    });

    it('deletes its own', async () => {
      await request(server()).delete(`/api/v1/categories/${ownId}`).set('Authorization', auth()).expect(204);

      expect((await listCategories()).some((category) => category.id === ownId)).toBe(false);
    });
  });

  describe('a personal category cannot take a shared name', () => {
    it('rejects a name the seeded catalogue already uses', async () => {
      // The unique index cannot catch this: it is keyed on `{ userId, slug }`
      // and the two rows differ in `userId`. Allowing it put two rows with the
      // same label in the variance table, with the spend split between them.
      const response = await request(server())
        .post('/api/v1/categories')
        .set('Authorization', auth())
        .send({ name: sharedCategoryName })
        .expect(409);

      expect((response.body as IErrorBody).code).toBe('CONFLICT');
    });

    it('rejects it whatever the capitalisation and spacing', async () => {
      await request(server())
        .post('/api/v1/categories')
        .set('Authorization', auth())
        .send({ name: `  ${sharedCategoryName.toUpperCase()}  ` })
        .expect(409);
    });

    it('rejects a rename onto a shared name', async () => {
      const created = await request(server())
        .post('/api/v1/categories')
        .set('Authorization', auth())
        .send({ name: 'Temporary Name' })
        .expect(201);

      const { id } = created.body as ICategoryBody;

      await request(server())
        .patch(`/api/v1/categories/${id}`)
        .set('Authorization', auth())
        .send({ name: sharedCategoryName })
        .expect(409);

      await request(server()).delete(`/api/v1/categories/${id}`).set('Authorization', auth()).expect(204);
    });

    it('still lets a different account use its own new name, since names are per account', async () => {
      // Two accounts may each have "Team Offsites". The rule bans shadowing the
      // shared catalogue, not sharing a name with an unrelated tenant.
      await request(server())
        .post('/api/v1/categories')
        .set('Authorization', auth())
        .send({ name: 'Quarterly Planning' })
        .expect(201);

      await request(server())
        .post('/api/v1/categories')
        .set('Authorization', otherAuth())
        .send({ name: 'Quarterly Planning' })
        .expect(201);
    });
  });
});
