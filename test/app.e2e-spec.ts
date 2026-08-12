import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { bootstrapNestServer } from '../src/bootstrap';

/**
 * Shape of a Terminus health response, narrowed from supertest's untyped body.
 *
 * @property status - `ok` when every indicator passed.
 * @property info - The indicators that passed.
 */
interface IHealthBody {
  status: string;
  info: Record<string, { status: string }>;
}

/**
 * Shape of the error envelope, narrowed from supertest's untyped body.
 *
 * @property statusCode - HTTP status, repeated in the body.
 * @property code - The stable code a client branches on.
 * @property requestId - Correlates the response with its log lines.
 * @property path - The path that produced the error.
 */
interface IErrorBody {
  statusCode: number;
  code: string;
  requestId: string;
  path: string;
}

describe('Application (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // MONGODB_URI is already in the environment: the global setup started the
    // replica set before any test file was loaded.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();

    // The same bootstrap the running server uses, so the prefix, versioning,
    // validation pipe, and exception filter are under test rather than being
    // configuration that only exists in production.
    bootstrapNestServer(app);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = (): Server => app.getHttpServer() as Server;

  it('resolves the whole dependency graph and connects to the database', () => {
    expect(app).toBeDefined();
  });

  it('answers liveness without touching the database', async () => {
    const response = await request(server()).get('/api/v1/health').expect(200);
    const body = response.body as IHealthBody;

    expect(body.status).toBe('ok');
    expect(body.info).toEqual({});
  });

  it('answers readiness with the database indicator up', async () => {
    const response = await request(server()).get('/api/v1/health/ready').expect(200);
    const body = response.body as IHealthBody;

    expect(body.status).toBe('ok');
    expect(body.info['database']?.status).toBe('up');
    expect(body.info['memory_heap']?.status).toBe('up');
  });

  it('serves routes only under the versioned api prefix', async () => {
    await request(server()).get('/health').expect(404);
    await request(server()).get('/api/health').expect(404);
  });

  it('returns the documented error envelope, with a request id', async () => {
    const response = await request(server()).get('/api/v1/nope').expect(404);
    const body = response.body as IErrorBody;

    expect(body.statusCode).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.path).toBe('/api/v1/nope');
    expect(body.requestId.length).toBeGreaterThan(0);
    expect(response.headers['x-request-id']).toBe(body.requestId);
  });
});
