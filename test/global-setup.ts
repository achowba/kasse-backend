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
};

export default globalSetup;
