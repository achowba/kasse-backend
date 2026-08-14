import { ConfigService } from '@nestjs/config';
import { Connection } from 'mongoose';
import { NodeEnvEnum } from '@common/enums';
import { resolveTopologyPolicy, TopologyCheck, TopologyPolicyEnum } from './topology.check';

/**
 * Builds a connection whose `hello` answers the way a given deployment would.
 *
 * @remarks
 * `hello` is the whole probe, and `setName` is the whole answer, so the fake
 * only has to produce that one field. A replica set member returns it; a
 * standalone does not.
 *
 * @param setName - The replica set name, or undefined for a standalone.
 * @returns A connection stand in.
 */
const buildConnection = (setName?: string): Connection =>
  ({
    db: {
      admin: () => ({
        command: jest.fn().mockResolvedValue(setName === undefined ? { ok: 1 } : { ok: 1, setName }),
      }),
    },
  }) as unknown as Connection;

/**
 * Builds a config service reporting a given environment.
 *
 * @param nodeEnv - The environment to report.
 * @returns A config service stand in.
 */
const buildConfig = (nodeEnv: NodeEnvEnum): ConfigService =>
  ({ getOrThrow: jest.fn().mockReturnValue({ nodeEnv }) }) as unknown as ConfigService;

describe('resolveTopologyPolicy', () => {
  it.each([
    ['development', NodeEnvEnum.DEVELOPMENT],
    ['test', NodeEnvEnum.TEST],
    ['staging', NodeEnvEnum.STAGING],
    ['production', NodeEnvEnum.PRODUCTION],
  ])('refuses to boot in %s', (_label: string, nodeEnv: NodeEnvEnum) => {
    // The same answer everywhere, and deliberately so. Refresh token rotation
    // runs in a transaction and an access token lives fifteen minutes, so a
    // standalone does not break an edge case, it breaks every session that
    // outlives one token. Warning would buy a service that works briefly and
    // then fails away from the cause.
    expect(resolveTopologyPolicy(nodeEnv)).toBe(TopologyPolicyEnum.REFUSE_TO_BOOT);
  });
});

describe('TopologyCheck', () => {
  it('starts quietly against a replica set', async () => {
    const check = new TopologyCheck(buildConnection('rs0'), buildConfig(NodeEnvEnum.PRODUCTION));

    await expect(check.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('refuses to start against a standalone', async () => {
    const check = new TopologyCheck(buildConnection(), buildConfig(NodeEnvEnum.PRODUCTION));

    await expect(check.onApplicationBootstrap()).rejects.toThrow(/standalone/i);
  });

  it('refuses in development too, where the mistake is actually made', async () => {
    // Atlas is always a replica set, so this can only ever fire locally. A check
    // that exempted development would therefore never fire at all.
    const check = new TopologyCheck(buildConnection(), buildConfig(NodeEnvEnum.DEVELOPMENT));

    await expect(check.onApplicationBootstrap()).rejects.toThrow(/standalone/i);
  });

  it('names both remedies, because the driver’s own message misdirects', async () => {
    const check = new TopologyCheck(buildConnection(), buildConfig(NodeEnvEnum.DEVELOPMENT));

    // The driver says "add retryWrites=false", which disables an unrelated
    // retry layer and moves the same failure one step later. This message has
    // to be better than that or the check has not earned its place.
    await expect(check.onApplicationBootstrap()).rejects.toThrow(/docker compose up -d/);
    await expect(check.onApplicationBootstrap()).rejects.toThrow(/rs\.initiate\(\)/);
  });

  it('says what depends on transactions, not just that they are missing', async () => {
    const check = new TopologyCheck(buildConnection(), buildConfig(NodeEnvEnum.PRODUCTION));

    await expect(check.onApplicationBootstrap()).rejects.toThrow(/Refresh token rotation and CSV import/);
  });

  it('treats an unreachable database handle as a standalone rather than assuming the best', async () => {
    // If the handle is not there the answer is unknown, and an unknown topology
    // is not evidence of a working one. Assuming a replica set would defeat the
    // check in exactly the case where something is already wrong.
    const check = new TopologyCheck({ db: undefined } as unknown as Connection, buildConfig(NodeEnvEnum.PRODUCTION));

    await expect(check.onApplicationBootstrap()).rejects.toThrow(/standalone/i);
  });
});
