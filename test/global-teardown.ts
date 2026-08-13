import { globalWithMongo } from './mongo-global';

/**
 * Stops the in-memory MongoDB started by the global setup.
 *
 * @remarks
 * Without this the mongod process outlives the run and Jest does not exit.
 *
 * @returns A promise that resolves once the server has stopped.
 */
const globalTeardown = async (): Promise<void> => {
  await globalWithMongo.mongoReplicaSet?.stop();
  globalWithMongo.mongoReplicaSet = undefined;
};

export default globalTeardown;
