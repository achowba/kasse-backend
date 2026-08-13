import { Types } from 'mongoose';
import { ADDRESS_TRACKER_PREFIX, USER_TRACKER_PREFIX } from './throttling.constants';
import { UserThrottlerGuard } from './user-throttler.guard';

/**
 * Reaches the protected tracker without standing up the whole guard.
 *
 * @remarks
 * `getTracker` is protected because nothing outside the guard should call it in
 * production. A test is not production, and the choice it makes is the entire
 * behaviour worth testing, so it is reached here through a narrow cast rather
 * than by loosening the modifier.
 */
interface ITrackerReader {
  getTracker: (request: unknown) => Promise<string>;
}

describe('UserThrottlerGuard', () => {
  const guard = Object.create(UserThrottlerGuard.prototype) as ITrackerReader;

  /**
   * Reads the tracker the guard would count a request against.
   *
   * @param request - The request to classify.
   * @returns The tracker key.
   */
  const trackerFor = async (request: unknown): Promise<string> => await guard.getTracker(request);

  describe('an authenticated request', () => {
    it('counts against the account, not the address', async () => {
      const userId = new Types.ObjectId();

      expect(await trackerFor({ user: { userId }, ip: '203.0.113.7' })).toBe(`${USER_TRACKER_PREFIX}:${userId.toString()}`);
    });

    it('gives one account the same bucket from two addresses', async () => {
      const userId = new Types.ObjectId();

      const fromLaptop = await trackerFor({ user: { userId }, ip: '203.0.113.7' });
      const fromPhone = await trackerFor({ user: { userId }, ip: '198.51.100.4' });

      // The loose half of the problem with addresses. One account spread across
      // devices and cloud addresses would otherwise never reach a limit.
      expect(fromLaptop).toBe(fromPhone);
    });

    it('gives two accounts different buckets from one address', async () => {
      const shared = '203.0.113.7';

      const first = await trackerFor({ user: { userId: new Types.ObjectId() }, ip: shared });
      const second = await trackerFor({ user: { userId: new Types.ObjectId() }, ip: shared });

      // The coarse half. Everyone behind one office NAT shared a bucket, so one
      // person could make the product look broken for the people beside them.
      expect(first).not.toBe(second);
    });
  });

  describe('an unauthenticated request', () => {
    it('falls back to the address, since there is nothing else to count', async () => {
      expect(await trackerFor({ ip: '203.0.113.7' })).toBe(`${ADDRESS_TRACKER_PREFIX}:203.0.113.7`);
    });

    it('counts requests with no address together rather than letting them through', async () => {
      // Possible behind a proxy that strips the address. Throttling more than it
      // should is the safe failure; the unsafe one is an unattributable flood
      // that is never counted at all.
      expect(await trackerFor({})).toBe(`${ADDRESS_TRACKER_PREFIX}:unknown`);
    });

    it('treats a user object with no id as unauthenticated', async () => {
      expect(await trackerFor({ user: {}, ip: '203.0.113.7' })).toBe(`${ADDRESS_TRACKER_PREFIX}:203.0.113.7`);
    });
  });

  it('never lets an account inherit the bucket its address was already filling', async () => {
    const userId = new Types.ObjectId();
    const address = '203.0.113.7';

    const beforeSignIn = await trackerFor({ ip: address });
    const afterSignIn = await trackerFor({ user: { userId }, ip: address });

    // What the prefixes are for. Without them the two keys could collide and a
    // request that had just authenticated would arrive at a partly spent bucket.
    expect(beforeSignIn).not.toBe(afterSignIn);
    expect(beforeSignIn.startsWith(`${ADDRESS_TRACKER_PREFIX}:`)).toBe(true);
    expect(afterSignIn.startsWith(`${USER_TRACKER_PREFIX}:`)).toBe(true);
  });
});
