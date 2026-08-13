import { Types } from 'mongoose';

/**
 * The caller, as established by the access token.
 *
 * @remarks
 * Attached to the request by the JWT strategy and read by the `@CurrentUser`
 * decorator. It holds what the token carries and nothing more. Anything else
 * about the account is read from the database, so a stale token cannot carry
 * stale settings into a request.
 *
 * The address is here for attribution, so a log line can name the account
 * without a database read on every request. **Nothing may be decided from
 * it.** Authorisation is on `userId` alone, every query is scoped by it, and
 * a token issued before an address changed carries the old one until it
 * expires. Treat it as a label, never as an identity.
 *
 * @property userId - The authenticated account, already parsed into an ObjectId.
 * @property email - The account's address when the token was issued. For logging only.
 */
export interface IAuthenticatedUser {
  userId: Types.ObjectId;
  email: string;
}
