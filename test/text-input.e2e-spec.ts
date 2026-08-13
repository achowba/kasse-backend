import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { bootstrapNestServer } from '../src/bootstrap';

/**
 * Builds a string from code points.
 *
 * @remarks
 * Every character under test is invisible, so writing them literally would give
 * a spec nobody can review and one a formatter could silently empty, leaving a
 * test that compares two identical strings and passes having asserted nothing.
 *
 * @param codePoints - The code points to build from.
 * @returns The resulting string.
 */
const chars = (...codePoints: number[]): string => String.fromCodePoint(...codePoints);

const ZERO_WIDTH_SPACE = chars(0x200b);
const SOFT_HYPHEN = chars(0x00ad);
const VARIATION_SELECTOR = chars(0xfe0e);
const NO_BREAK_SPACE = chars(0x00a0);
const RIGHT_TO_LEFT_OVERRIDE = chars(0x202e);
const NULL_BYTE = chars(0x0000);

/**
 * A category as the API returns it.
 *
 * @property id - Identifier used by every other endpoint.
 * @property name - The name as stored.
 */
interface ICategoryBody {
  id: string;
  name: string;
}

/**
 * Invisible and refused characters, end to end against a real MongoDB.
 *
 * @remarks
 * The uniqueness rules here are enforced by a comparison key and a unique index,
 * and a unit test cannot show that the two agree. These go through the API and
 * read the result back.
 */
describe('Text input (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  const created: string[] = [];

  const auth = (): string => `Bearer ${accessToken}`;
  const server = (): Server => app.getHttpServer() as Server;

  /**
   * Attempts to create a category.
   *
   * @param name - The name to send, invisible characters and all.
   * @returns The supertest response.
   */
  const createCategory = (name: string): request.Test =>
    request(server()).post('/api/v1/categories').set('Authorization', auth()).send({ name });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    bootstrapNestServer(app);
    await app.init();

    const signup = await request(server())
      .post('/api/v1/auth/signup')
      .send({ email: `text-${Date.now()}@example.com`, password: 'a-long-enough-password' })
      .expect(201);

    accessToken = (signup.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('invisible characters are removed before anything is stored', () => {
    it('stores a name with no trace of what was pasted around it', async () => {
      const response = await createCategory(`${VARIATION_SELECTOR}Quarterly Offsite${VARIATION_SELECTOR}`).expect(201);
      const category = response.body as ICategoryBody;

      created.push(category.id);

      expect(category.name).toBe('Quarterly Offsite');
    });

    it('folds a no break space to an ordinary one', async () => {
      const response = await createCategory(`Client${NO_BREAK_SPACE}Entertainment`).expect(201);
      const category = response.body as ICategoryBody;

      created.push(category.id);

      expect(category.name).toBe('Client Entertainment');
    });

    it('refuses a name that is nothing but invisible characters', async () => {
      // Before sanitising ran ahead of validation this passed a minimum length
      // rule as three characters and stored a category nobody could see in a
      // picker or ever type again.
      const response = await createCategory(`${ZERO_WIDTH_SPACE}${VARIATION_SELECTOR}${SOFT_HYPHEN}`).expect(400);

      expect((response.body as { code: string }).code).toBe('VALIDATION_FAILED');
    });
  });

  describe('invisible characters cannot smuggle a duplicate past uniqueness', () => {
    it('treats a zero width space as the same name', async () => {
      const first = await createCategory('Board Travel').expect(201);

      created.push((first.body as ICategoryBody).id);

      // The bypass this closes. The key used to collapse the zero width space to
      // a hyphen rather than removing it, so this was a separate category that
      // looked identical in every picker and split its spend across two rows of
      // the variance report.
      const duplicate = await createCategory(`Board${ZERO_WIDTH_SPACE} Travel`).expect(409);

      expect((duplicate.body as { code: string }).code).toBe('CONFLICT');
    });

    it('treats a soft hyphen as the same name', async () => {
      const duplicate = await createCategory(`Board Tra${SOFT_HYPHEN}vel`).expect(409);

      expect((duplicate.body as { code: string }).code).toBe('CONFLICT');
    });

    it('treats a differently spelled accent as the same name', async () => {
      const first = await createCategory(chars(0x43, 0x61, 0x66, 0xe9)).expect(201);

      created.push((first.body as ICategoryBody).id);

      // Composed on most systems, decomposed on macOS. The same name typed on
      // two machines used to key differently, and neither keyed as "cafe".
      const decomposed = await createCategory(chars(0x43, 0x61, 0x66, 0x65, 0x301)).expect(409);
      const unaccented = await createCategory('Cafe').expect(409);

      expect((decomposed.body as { code: string }).code).toBe('CONFLICT');
      expect((unaccented.body as { code: string }).code).toBe('CONFLICT');
    });
  });

  describe('a name in a non Latin script is usable', () => {
    it('accepts one instead of rejecting it as having no letters', async () => {
      // The key used to delete every non ASCII letter, so this reduced to an
      // empty string and the caller was told their name needed a letter in it.
      const response = await createCategory(chars(0x411, 0x44e, 0x434, 0x436, 0x435, 0x442)).expect(201);
      const category = response.body as ICategoryBody;

      created.push(category.id);

      expect(category.name).toBe(chars(0x411, 0x44e, 0x434, 0x436, 0x435, 0x442));
    });
  });

  describe('characters that are refused rather than cleaned', () => {
    it.each([
      ['a text direction override', `Board${RIGHT_TO_LEFT_OVERRIDE} Meeting`],
      ['a null byte', `Board${NULL_BYTE} Meeting`],
    ])('answers 400 for %s', async (_label: string, name: string) => {
      const response = await createCategory(name).expect(400);

      expect((response.body as { code: string }).code).toBe('VALIDATION_FAILED');
    });

    it('refuses one in an expense note as well as in a name', async () => {
      const category = await createCategory('Stationery').expect(201);
      const categoryId = (category.body as ICategoryBody).id;

      created.push(categoryId);

      await request(server())
        .post('/api/v1/expenses')
        .set('Authorization', auth())
        .send({ categoryId, month: '2026-03', amountMinor: 1000, note: `Paper${RIGHT_TO_LEFT_OVERRIDE}` })
        .expect(400);
    });
  });

  describe('the CSV import applies the same rules', () => {
    it('resolves a category name carrying an invisible character', async () => {
      const csv = `category,month,amount,note\nBoard${ZERO_WIDTH_SPACE} Travel,2026-04,120.00,Flights\n`;

      const response = await request(server())
        .post('/api/v1/imports/expenses')
        .set('Authorization', auth())
        .set('Idempotency-Key', `text-${Date.now()}`)
        .attach('file', Buffer.from(csv, 'utf8'), 'expenses.csv')
        .expect(201);

      // Resolves rather than failing as an unknown category, because the key
      // strips the character on both sides of the comparison.
      expect((response.body as { expenseCount: number }).expenseCount).toBe(1);
    });

    it('reports a refused character as a row error, with its line', async () => {
      const csv = `category,month,amount,note\nBoard Travel,2026-04,120.00,Fine${RIGHT_TO_LEFT_OVERRIDE}\n`;

      const response = await request(server())
        .post('/api/v1/imports/expenses')
        .set('Authorization', auth())
        .set('Idempotency-Key', `text-bad-${Date.now()}`)
        .attach('file', Buffer.from(csv, 'utf8'), 'expenses.csv')
        .expect(422);

      const body = response.body as { details?: { errors?: { line: number; column: string | null }[] } };

      // Line 2, because the header is line 1. Sending someone to the wrong row
      // of their spreadsheet is worse than not locating it at all.
      expect(body.details?.errors?.[0]).toEqual(expect.objectContaining({ line: 2, column: 'note' }));
    });
  });
});
