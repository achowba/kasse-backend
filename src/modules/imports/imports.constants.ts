/**
 * The largest file the endpoint accepts, in bytes.
 *
 * @remarks
 * The whole file is parsed and validated in memory before anything is written,
 * because the import is fail closed. That makes the file size a memory bound on
 * the process, so it is capped rather than left to whatever a client sends.
 *
 * 5 MB is roughly 100,000 rows of this shape, well above the row cap below, so a
 * file hits {@link MAX_ROWS} first and gets the clearer error of the two.
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * The most rows one import may carry.
 *
 * @remarks
 * Every row is written in a single transaction, and a MongoDB transaction holds
 * its changes in memory until commit. Ten thousand is comfortably inside that and
 * covers a year of line items for a business of the size this serves. Past it the
 * right answer is a queue and a job, not a longer request, and the README says so.
 */
export const MAX_ROWS = 10_000;

/**
 * The columns a file must carry.
 *
 * @remarks
 * Matched case insensitively and after trimming, because a spreadsheet export
 * capitalises headers however the author typed them. Extra columns are ignored
 * rather than rejected: a file exported from an accounting system carries plenty
 * this import has no use for, and refusing it would make the user edit the file
 * for no reason.
 */
export const REQUIRED_COLUMNS = ['category', 'month', 'amount'] as const;

/** The optional column, carried onto the expense when present. */
export const NOTE_COLUMN = 'note';

/**
 * The header the endpoint requires to make a replay safe.
 *
 * @remarks
 * Named here because it appears in the controller, the service, and the Swagger
 * description, and a typo in one of them would silently disable the protection.
 */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** How many rejected rows are reported before the list is truncated. */
export const MAX_REPORTED_ERRORS = 100;
