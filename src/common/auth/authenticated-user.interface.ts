import { Types } from 'mongoose';

/**
 * The caller, as established by the access token.
 *
 * @remarks
 * Attached to the request by the JWT strategy and read by the `@CurrentUser`
 * decorator. It holds only what the token proves. Anything else about the
 * account is read from the database, so a stale token cannot carry stale
 * settings into a request.
 *
 * @property userId - The authenticated account, already parsed into an ObjectId.
 */
export interface IAuthenticatedUser {
  userId: Types.ObjectId;
}
