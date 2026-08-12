import { ClientSession, Connection } from 'mongoose';

/**
 * Runs a unit of work inside a MongoDB transaction.
 *
 * @remarks
 * Commits when the callback resolves, aborts when it throws, and always ends the
 * session. This is what makes a CSV import all or nothing: a bad row at line 400
 * cannot leave the first 399 behind.
 *
 * Two constraints on the callback. It must pass the session to every operation it
 * performs, because an operation without the session runs outside the transaction
 * and will not be rolled back. And it must be safe to run more than once:
 * `withTransaction` retries on a transient error, such as a write conflict.
 *
 * Transactions require a replica set. The compose file runs a single node one for
 * exactly this reason.
 *
 * @typeParam TResult - What the unit of work returns.
 * @param connection - The Mongoose connection to start the session on.
 * @param work - The unit of work. Receives the session it must pass along.
 * @returns Whatever the unit of work returned, once committed.
 * @throws Error Whatever the unit of work threw, after the transaction is aborted.
 */
export const withTransaction = async <TResult>(
  connection: Connection,
  work: (session: ClientSession) => Promise<TResult>,
): Promise<TResult> => {
  const session = await connection.startSession();

  try {
    return await session.withTransaction(async () => await work(session));
  } finally {
    await session.endSession();
  }
};
