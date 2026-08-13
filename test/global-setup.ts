import { generateKeyPairSync } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { globalWithMongo } from './mongo-global';

/**
 * Starts one in-memory MongoDB for the whole end to end run.
 *
 * @remarks
 * A replica set rather than a standalone server, because the application writes
 * in transactions and transactions require one.
 *
 * This runs before any test file is loaded, which is the point. `AppModule`
 * validates the environment at import time, and a static import is evaluated
 * before any `beforeAll` body, so setting the connection string inside a test
 * would already be too late.
 *
 * @returns A promise that resolves once the server is accepting connections.
 */
const globalSetup = async (): Promise<void> => {
  const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

  globalWithMongo.mongoReplicaSet = replicaSet;
  process.env['MONGODB_URI'] = replicaSet.getUri();

  // Rate limiting is framework behaviour that is configured rather than written
  // here, and a suite exercising the auth routes crosses the credential limit
  // within seconds. Raising the limits keeps these tests about authentication
  // instead of about the throttler. Set before any module loads, because the
  // auth route limit is read when the controller class is defined.
  process.env['THROTTLE_LIMIT'] = '100000';
  process.env['AUTH_THROTTLE_LIMIT'] = '100000';

  // A keypair per run, generated here for the same reason the database is: the
  // suite should bring everything it needs rather than borrowing it from whoever
  // happens to be running it.
  //
  // These were read from a developer's own `.env` before, which passed locally
  // and failed on any machine without one. CI has no `.env`, so the whole e2e
  // suite failed at environment validation the first time it ran there.
  //
  // Generating them also means no test signing key exists anywhere to be leaked,
  // and each run gets a fresh one, so a token cannot outlive the run that made it.
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    // 2048 rather than 4096: the tokens live for the length of a test run, and
    // key generation is startup cost paid before the first test.
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  // Base64, matching how a deployment supplies them. A PEM carries newlines, and
  // an environment variable that has to survive a shell, a Docker file, and a
  // platform's secret store is far less trouble as one line.
  process.env['JWT_PRIVATE_KEY'] = Buffer.from(privateKey, 'utf8').toString('base64');
  process.env['JWT_PUBLIC_KEY'] = Buffer.from(publicKey, 'utf8').toString('base64');
};

export default globalSetup;
