import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Types } from 'mongoose';
import { ADDRESS_TRACKER_PREFIX, USER_TRACKER_PREFIX } from './throttling.constants';

/**
 * A request, as much of it as the tracker needs.
 *
 * @property user - Attached by the JWT strategy once a token has been verified.
 * @property ip - The peer address, as Express resolves it.
 */
interface ITrackableRequest {
  user?: { userId?: Types.ObjectId };
  ip?: string;
}

/**
 * Rate limits an authenticated caller by account, and everyone else by address.
 *
 * @remarks
 * Addresses are the wrong unit for an authenticated API, in both directions:
 *
 * - **Too coarse.** An office, a school, or anything behind NAT shares one
 *   address. One person running reports would exhaust the bucket for everybody
 *   sitting next to them, and the product would appear to break for people who
 *   did nothing.
 * - **Too loose.** A single account can spread requests across a phone, a laptop,
 *   and a handful of cloud addresses and never reach a per address limit at all.
 *   The thing being limited is not the thing doing the work.
 *
 * Once a request is authenticated the account is the meaningful unit of abuse, so
 * that is what gets counted. Unauthenticated requests still fall back to the
 * address, because there is nothing else to count and signup and login have to be
 * limited before anybody has an account.
 *
 * The prefixes matter for the same reason: a request that has just authenticated
 * must not inherit the bucket its address was already filling.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  /**
   * Chooses what to count a request against.
   *
   * @remarks
   * Reads `request.user`, which the JWT strategy attaches. Guard order is what
   * makes that safe: the global authentication guard runs first, so by the time
   * this is reached a token has either been verified or the route is public.
   *
   * @param request - The incoming request.
   * @returns The tracker key: the account when there is one, the address otherwise.
   */
  protected override getTracker(request: ITrackableRequest): Promise<string> {
    const userId = request.user?.userId;

    if (userId !== undefined) {
      return Promise.resolve(`${USER_TRACKER_PREFIX}:${userId.toString()}`);
    }

    // An absent address is possible behind a proxy that strips it. Counting those
    // together is the safe failure: it throttles more than it should rather than
    // letting an unattributable flood through unlimited.
    return Promise.resolve(`${ADDRESS_TRACKER_PREFIX}:${request.ip ?? 'unknown'}`);
  }
}
