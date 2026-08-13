/**
 * How an account is identified on a log line.
 *
 * @remarks
 * One shape, everywhere, because the point of it is filtering. A line that says
 * `userId` and another that says `user.id` cannot be selected by the same query,
 * so a search for one account silently returns half its activity, which is worse
 * than returning none: it looks like an answer.
 *
 * @property id - The account identifier, as a string.
 * @property email - The login address, present only where it was already loaded.
 */
export interface ILoggedUser {
  id: string;
  email?: string;
}

/**
 * Builds the user context attached to a log line.
 *
 * @remarks
 * The email is optional on purpose rather than by oversight. An access token
 * carries only the account id, which is what keeps verification free of a
 * database read, so a request handler knows who is calling without knowing their
 * address. Adding the address to every line would mean loading the account on
 * every request and undoing that.
 *
 * So the address appears where the account was already in hand, which is signup,
 * login, and a password change, and is absent elsewhere. The id is on every
 * line, and one lookup turns an id into an address when it is needed.
 *
 * @param id - The account identifier.
 * @param email - The login address, when it has already been loaded.
 * @returns The context to spread into a log call.
 */
export const logUser = (id: string, email?: string): { user: ILoggedUser } => ({
  user: email === undefined ? { id } : { id, email },
});
