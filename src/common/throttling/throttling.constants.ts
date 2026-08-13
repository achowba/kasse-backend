/*
 * Read from the environment rather than injected, which is the same documented
 * exception the credential route limits take. `@Throttle` is a decorator, so its
 * values are needed when the class is defined, before any injector exists.
 *
 * Being configuration rather than a literal is not only for deployments: the end
 * to end suite runs far more than six imports, and a hardcoded limit would make
 * the suite a test of the throttler instead of a test of the import.
 */

/**
 * How many reports one account may run per window.
 *
 * @remarks
 * A report is an aggregation across two collections. It is cached per account and
 * per data version, so a reader refreshing the same view costs one query and then
 * nothing, and only genuinely new questions reach the database.
 *
 * The limit therefore bounds distinct questions rather than page views, which is
 * why it can sit well below the global request limit without getting in the way
 * of anyone using the product normally.
 */
export const REPORT_THROTTLE_LIMIT = Number(process.env['REPORT_THROTTLE_LIMIT'] ?? 60);

/**
 * How many imports one account may run per window.
 *
 * @remarks
 * Deliberately small. An import parses up to 5 MB in memory, validates every row,
 * and writes up to ten thousand records in a single transaction, which makes it
 * the most expensive thing an authenticated caller can ask for by a wide margin.
 *
 * Six per minute is more than a person uploading spreadsheets will ever need and
 * far less than it takes to hurt the database.
 */
export const IMPORT_THROTTLE_LIMIT = Number(process.env['IMPORT_THROTTLE_LIMIT'] ?? 6);

/**
 * The window both limits are measured over, in milliseconds.
 */
export const EXPENSIVE_THROTTLE_TTL_MS = Number(process.env['EXPENSIVE_THROTTLE_TTL_MS'] ?? 60_000);

/**
 * Prefixes that keep an account's bucket separate from an address's.
 *
 * @remarks
 * Without them a user whose id happened to equal an address string would share a
 * counter with it. That will not happen with ObjectIds, but the prefix costs
 * nothing and means the tracker's output can be read and understood in a log.
 */
export const USER_TRACKER_PREFIX = 'user';
export const ADDRESS_TRACKER_PREFIX = 'ip';
