import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { bootstrapNestServer } from '../src/bootstrap';

/**
 * The import batch response, narrowed from supertest's untyped body.
 *
 * @property id - Identifier of the batch.
 * @property status - Whether the rows were written.
 * @property rowCount - How many data rows the file carried.
 * @property errorCount - How many were rejected.
 * @property expenseCount - How many expenses it wrote.
 * @property errors - The rejected rows.
 */
interface IBatchBody {
  id: string;
  status: string;
  rowCount: number;
  errorCount: number;
  expenseCount: number;
  errors: { line: number; column: string | null; message: string }[];
}

/**
 * The error envelope, narrowed from supertest's untyped body.
 *
 * @property code - The stable code a client branches on.
 * @property details - Structured specifics, such as the rejected rows.
 */
interface IErrorBody {
  code: string;
  details?: { errors?: { line: number; column: string | null }[]; month?: string };
}

/**
 * CSV import, end to end against a real MongoDB.
 *
 * @remarks
 * The two properties this endpoint is judged on cannot be tested with mocks.
 * Idempotency depends on a unique index, and failing closed depends on a real
 * transaction rolling back. Both are database behaviour, so both are asserted by
 * reading the expenses back out afterwards rather than by inspecting calls.
 */
describe('Imports (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  const auth = (): string => `Bearer ${accessToken}`;
  const server = (): Server => app.getHttpServer() as Server;

  /**
   * Uploads a CSV.
   *
   * @param body - The file contents.
   * @param idempotencyKey - The key to send.
   * @param filename - The filename to send.
   * @returns The supertest response.
   */
  const upload = (body: string, idempotencyKey: string, filename = 'expenses.csv'): request.Test =>
    request(server())
      .post('/api/v1/imports/expenses')
      .set('Authorization', auth())
      .set('Idempotency-Key', idempotencyKey)
      .attach('file', Buffer.from(body, 'utf8'), filename);

  /**
   * Counts the expenses in a month for the test account.
   *
   * @param month - The month to count.
   * @returns How many expenses that month holds.
   */
  const countExpenses = async (month: string): Promise<number> => {
    const response = await request(server())
      .get(`/api/v1/expenses?from=${month}&to=${month}&limit=200`)
      .set('Authorization', auth())
      .expect(200);

    return (response.body as { items: unknown[] }).items.length;
  };

  /**
   * Reads the total logged for a month from the report.
   *
   * @param month - The month to read.
   * @returns The spend total in minor units.
   */
  const reportedTotal = async (month: string): Promise<number> => {
    const response = await request(server())
      .get(`/api/v1/reports/plan-vs-spend?from=${month}&to=${month}`)
      .set('Authorization', auth())
      .expect(200);

    return (response.body as { totals: { spentMinor: number } }).totals.spentMinor;
  };

  const header = 'category,month,amount,note';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    bootstrapNestServer(app);
    await app.init();

    const signup = await request(server())
      .post('/api/v1/auth/signup')
      .send({ email: `imports-${Date.now()}@example.com`, password: 'a-long-enough-password' })
      .expect(201);

    accessToken = (signup.body as { accessToken: string }).accessToken;

    for (const name of ['Marketing', 'Payroll', 'Software']) {
      await request(server()).post('/api/v1/categories').set('Authorization', auth()).send({ name }).expect(201);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('a file that imports', () => {
    it('writes every row and reports what it wrote', async () => {
      const response = await upload(
        [header, 'Marketing,2027-01,4800.00,Q1 campaign', 'Payroll,2027-01,20500.00,'].join('\n'),
        'import-ok-1',
      ).expect(201);
      const body = response.body as IBatchBody;

      expect(body.status).toBe('COMPLETED');
      expect(body.rowCount).toBe(2);
      expect(body.expenseCount).toBe(2);
      expect(body.errorCount).toBe(0);
      expect(await countExpenses('2027-01')).toBe(2);
    });

    it('stores amounts exactly, without a floating point cent going missing', async () => {
      await upload([header, 'Software,2027-02,4800.10,'].join('\n'), 'import-exact-1').expect(201);

      // 4800.10 * 100 in floating point is 480009.99999999994. Reading the digits
      // is what keeps the cent.
      expect(await reportedTotal('2027-02')).toBe(480_010);
    });

    it('tags the rows with the batch that wrote them', async () => {
      const response = await upload([header, 'Marketing,2027-03,100.00,'].join('\n'), 'import-tag-1').expect(201);
      const batchId = (response.body as IBatchBody).id;

      const listed = await request(server())
        .get(`/api/v1/expenses?importBatchId=${batchId}`)
        .set('Authorization', auth())
        .expect(200);

      expect((listed.body as { items: { source: string }[] }).items).toHaveLength(1);
      expect((listed.body as { items: { source: string }[] }).items[0]?.source).toBe('CSV');
    });

    it('shows up in the report immediately', async () => {
      await upload([header, 'Marketing,2027-04,250.00,', 'Payroll,2027-04,750.00,'].join('\n'), 'import-report-1').expect(201);

      expect(await reportedTotal('2027-04')).toBe(100_000);
    });
  });

  describe('failing closed', () => {
    it('writes nothing at all when one row is bad', async () => {
      const response = await upload(
        [header, 'Marketing,2027-05,100.00,', 'Payroll,2027-13,200.00,', 'Marketing,2027-05,300.00,'].join('\n'),
        'import-bad-1',
      ).expect(422);
      const body = response.body as IErrorBody;

      expect(body.code).toBe('IMPORT_VALIDATION_FAILED');
      expect(body.details?.errors?.[0]).toEqual(expect.objectContaining({ line: 3, column: 'month' }));

      // The two good rows are not written either. This is the property that makes
      // a corrected file safe to re-upload.
      expect(await countExpenses('2027-05')).toBe(0);
    });

    it('reports every bad row with its line number, not just the first', async () => {
      const response = await upload(
        [header, ',2027-06,100.00,', 'Payroll,not-a-month,200.00,', 'Marketing,2027-06,abc,'].join('\n'),
        'import-bad-2',
      ).expect(422);

      expect((response.body as IErrorBody).details?.errors?.map((error) => error.line)).toEqual([2, 3, 4]);
    });

    it('rejects a category the account does not have, naming the line', async () => {
      const response = await upload(
        [header, 'Marketing,2027-07,100.00,', 'Nonexistent Category,2027-07,200.00,'].join('\n'),
        'import-bad-3',
      ).expect(422);

      expect((response.body as IErrorBody).details?.errors?.[0]).toEqual(
        expect.objectContaining({ line: 3, column: 'category' }),
      );
      expect(await countExpenses('2027-07')).toBe(0);
    });

    it('keeps the failed attempt so the user can find out why later', async () => {
      await upload([header, 'Payroll,2027-99,200.00,'].join('\n'), 'import-bad-4', 'broken.csv').expect(422);

      const listed = await request(server()).get('/api/v1/imports').set('Authorization', auth()).expect(200);
      const failed = (listed.body as { items: IBatchBody[] }).items.find(
        (batch) => batch.status === 'FAILED' && batch.errorCount > 0,
      );

      expect(failed).toBeDefined();
      expect(failed?.expenseCount).toBe(0);
    });

    it('rejects a file missing a required column as a bad request', async () => {
      const response = await upload(['category,note', 'Marketing,hello'].join('\n'), 'import-bad-5').expect(400);

      // Named, so the user knows which columns to add rather than guessing.
      expect((response.body as { message: string }).message).toContain('month');
    });

    it('rejects a file with only a header', async () => {
      const response = await upload(header, 'import-bad-6').expect(400);

      expect((response.body as { message: string }).message).toContain('no data rows');
    });

    it('refuses the whole file when any month in it is closed', async () => {
      await request(server())
        .post('/api/v1/period-locks')
        .set('Authorization', auth())
        .send({ months: ['2027-08'] })
        .expect(201);

      const response = await upload(
        [header, 'Marketing,2027-09,100.00,', 'Payroll,2027-08,200.00,'].join('\n'),
        'import-locked-1',
      ).expect(423);

      expect((response.body as IErrorBody).code).toBe('PERIOD_LOCKED');
      expect((response.body as IErrorBody).details?.month).toBe('2027-08');

      // Not one row of it, including the row for the open month.
      expect(await countExpenses('2027-09')).toBe(0);
    });
  });

  describe('idempotency', () => {
    it('does not double a month when the same key is sent twice', async () => {
      const file = [header, 'Marketing,2027-10,1000.00,', 'Payroll,2027-10,2000.00,'].join('\n');

      const first = await upload(file, 'import-replay-1').expect(201);
      const second = await upload(file, 'import-replay-1').expect(201);

      // The same batch, not a second one. This is the case a client hitting a
      // timeout and retrying actually produces.
      expect((second.body as IBatchBody).id).toBe((first.body as IBatchBody).id);
      expect(await countExpenses('2027-10')).toBe(2);
      expect(await reportedTotal('2027-10')).toBe(300_000);
    });

    it('returns the original result even when the second upload has different contents', async () => {
      const first = await upload([header, 'Marketing,2027-11,500.00,'].join('\n'), 'import-replay-2').expect(201);
      const second = await upload([header, 'Payroll,2027-11,9999.00,'].join('\n'), 'import-replay-2').expect(201);

      // The key identifies the operation, not the payload. A client reusing a key
      // for different content has a bug, and answering with the original is the
      // safe reading.
      expect((second.body as IBatchBody).id).toBe((first.body as IBatchBody).id);
      expect(await reportedTotal('2027-11')).toBe(50_000);
    });

    it('imports normally under a new key', async () => {
      const file = [header, 'Marketing,2027-12,100.00,'].join('\n');

      await upload(file, 'import-replay-3').expect(201);
      await upload(file, 'import-replay-4').expect(201);

      expect(await countExpenses('2027-12')).toBe(2);
    });

    it('requires the header', async () => {
      await request(server())
        .post('/api/v1/imports/expenses')
        .set('Authorization', auth())
        .attach('file', Buffer.from([header, 'Marketing,2028-01,100.00,'].join('\n'), 'utf8'), 'expenses.csv')
        .expect(400);
    });

    it('scopes keys to the account, so two users may use the same key', async () => {
      const other = await request(server())
        .post('/api/v1/auth/signup')
        .send({ email: `imports-other-${Date.now()}@example.com`, password: 'a-long-enough-password' })
        .expect(201);
      const otherToken = (other.body as { accessToken: string }).accessToken;

      await request(server())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Marketing' })
        .expect(201);

      await request(server())
        .post('/api/v1/imports/expenses')
        .set('Authorization', `Bearer ${otherToken}`)
        .set('Idempotency-Key', 'import-replay-1')
        .attach('file', Buffer.from([header, 'Marketing,2028-02,42.00,'].join('\n'), 'utf8'), 'expenses.csv')
        .expect(201);
    });
  });

  describe('reading imports back', () => {
    it('lists the account’s imports newest first', async () => {
      const response = await request(server()).get('/api/v1/imports').set('Authorization', auth()).expect(200);

      expect((response.body as { items: IBatchBody[] }).items.length).toBeGreaterThan(0);
    });

    it('answers 404 for an import belonging to nobody', async () => {
      await request(server()).get('/api/v1/imports/000000000000000000000000').set('Authorization', auth()).expect(404);
    });

    it('refuses an unauthenticated upload', async () => {
      await request(server())
        .post('/api/v1/imports/expenses')
        .set('Idempotency-Key', 'anon')
        .attach('file', Buffer.from([header, 'Marketing,2028-03,1.00,'].join('\n'), 'utf8'), 'expenses.csv')
        .expect(401);
    });
  });

  describe('the sample files committed to examples/', () => {
    // Documentation that is not executed rots. These are offered to a reader as
    // "upload this and it works", and the categories in them come from the
    // shared catalogue, so renaming one entry there would break the promise
    // silently. Reading the real files is the only thing that catches it.
    const sample = (name: string): Buffer => readFileSync(join(__dirname, '..', 'examples', name));

    it('imports the valid one on an account that has done nothing but sign up', async () => {
      const response = await request(server())
        .post('/api/v1/imports/expenses')
        .set('Authorization', auth())
        .set('Idempotency-Key', `sample-valid-${String(Date.now())}`)
        .attach('file', sample('expenses.csv'), 'expenses.csv')
        .expect(201);

      const batch = response.body as IBatchBody;

      expect(batch.status).toBe('COMPLETED');
      expect(batch.errorCount).toBe(0);
      expect(batch.expenseCount).toBe(batch.rowCount);
    });

    it('rejects the broken one with an error on every line the README lists, and writes nothing', async () => {
      // Measured as a delta rather than against zero: the valid sample above
      // also writes to 2026-02, so an absolute count would assert its data and
      // say nothing at all about this upload.
      const before = await countExpenses('2026-02');

      const response = await request(server())
        .post('/api/v1/imports/expenses')
        .set('Authorization', auth())
        .set('Idempotency-Key', `sample-broken-${String(Date.now())}`)
        .attach('file', sample('expenses-with-errors.csv'), 'expenses-with-errors.csv')
        .expect(422);

      const body = response.body as IErrorBody;

      // The lines and columns the examples README publishes. If the file is
      // edited and the README is not, the documentation is wrong and this says
      // so.
      expect(body.details?.errors).toEqual([
        expect.objectContaining({ line: 3, column: 'category' }),
        expect.objectContaining({ line: 4, column: 'month' }),
        expect.objectContaining({ line: 5, column: 'amount' }),
        expect.objectContaining({ line: 6, column: 'category' }),
      ]);

      // All or nothing, including the two rows in that file that are perfectly
      // valid. This is the property that makes a corrected file safe to retry.
      expect(await countExpenses('2026-02')).toBe(before);
    });
  });
});
