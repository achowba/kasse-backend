import type { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * The handle the global setup and teardown share.
 *
 * @property mongoReplicaSet - The running in-memory replica set, while there is one.
 */
interface IGlobalWithMongo {
  mongoReplicaSet?: MongoMemoryReplSet;
}

/**
 * `globalThis`, typed for the one property the test harness stores on it.
 *
 * @remarks
 * Jest runs `globalSetup` and `globalTeardown` in the same process, so a value
 * placed here in setup is still there in teardown. Test workers are separate
 * processes and cannot see it; they receive the connection string through
 * `process.env`, which Jest copies into each worker.
 */
export const globalWithMongo = globalThis as unknown as IGlobalWithMongo;
