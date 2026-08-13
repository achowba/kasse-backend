import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { bootstrapNestServer, buildOpenApiDocument } from '../src/bootstrap';
import { API_DOC_VERSION } from '../src/common/constants';

/** Where the committed contract lives, relative to this file. */
const CONTRACT_PATH = join(__dirname, '..', 'openapi.json');

/** Set to regenerate the committed contract instead of checking it. */
const SHOULD_UPDATE = process.env['UPDATE_OPENAPI'] === 'true';

/**
 * Checks that the committed contract matches the application.
 *
 * @remarks
 * `openapi.json` is committed because the web client lives in its own repository
 * and generates its types from it. Reading `/docs-json` instead would mean
 * booting this API, with a database and signing keys, from another repository's
 * build, which its CI cannot do. A committed file also makes a breaking change
 * visible in a pull request diff rather than only in whatever happens to be
 * running.
 *
 * The cost of a committed artefact is that it goes stale, which is what this
 * check exists to prevent. Regenerate with `npm run openapi:emit`.
 */
describe('OpenAPI contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();

    // The same bootstrap the running server uses, and not optional. The global
    // prefix and URI versioning are applied here rather than by AppModule, so
    // without it every path in the document comes out as /categories instead of
    // /api/v1/categories and a generated client 404s on every request.
    bootstrapNestServer(app);

    // The document is built from the routes Nest has registered, so the app must
    // be initialised, but it never listens: nothing here makes a request.
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('matches the committed openapi.json', () => {
    const generated = `${JSON.stringify(buildOpenApiDocument(app, API_DOC_VERSION), null, 2)}\n`;

    // In update mode the file is rewritten first, so the assertion below then
    // trivially holds. Writing here rather than asserting conditionally keeps a
    // single unconditional expectation, which is both the lint rule and the
    // clearer arrangement: there is one thing this test claims.
    if (SHOULD_UPDATE) {
      writeFileSync(CONTRACT_PATH, generated, 'utf8');
    }

    expect(readFileSync(CONTRACT_PATH, 'utf8')).toBe(generated);
  });
});
