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
};

export default globalSetup;
