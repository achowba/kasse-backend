/**
 * How many entries the dispatcher holds before it starts refusing them.
 *
 * @remarks
 * The buffer only grows when the database is slower than the write rate, so
 * reaching this number means something is already wrong. The cap exists so that
 * a database outage costs a bounded amount of memory rather than the process.
 *
 * A refused entry is logged in full at error level, so the trail survives in the
 * application logs even when the collection cannot be written.
 */
export const AUDIT_BUFFER_LIMIT = 10_000;

/**
 * How many entries go into one insert.
 *
 * @remarks
 * Large enough that a busy moment is a handful of round trips rather than one
 * per change, small enough to stay well inside the 16 MB command limit even when
 * entries carry a full before and after state.
 */
export const AUDIT_FLUSH_BATCH_SIZE = 500;
