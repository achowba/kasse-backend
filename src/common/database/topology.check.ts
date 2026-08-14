import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { IAppConfig } from '@common/config';
import { NodeEnvEnum } from '@common/enums';

/**
 * What a deployment that cannot run transactions means for this process.
 *
 * @remarks
 * Named rather than expressed as a boolean, because `shouldThrow: false` at a
 * call site says nothing about why continuing is acceptable.
 */
export enum TopologyPolicyEnum {
  /** Stop the process. The deployment cannot satisfy the module's guarantees. */
  REFUSE_TO_BOOT = 'refuse-to-boot',
  /** Log loudly and start anyway. Transactional paths will fail when reached. */
  WARN_AND_CONTINUE = 'warn-and-continue',
}

/**
 * Decides how this environment reacts to a deployment without transactions.
 *
 * @remarks
 * The answer is the same in every environment, which is why the parameter is
 * unused. It is kept because the question is genuinely per environment for most
 * services, and a reader arriving here should see that it was asked and settled
 * rather than never considered.
 *
 * **Why refuse rather than warn.**
 *
 * The obvious objection to refusing is that it blocks a developer running a
 * standalone `mongod` who only wants to read reports, for a capability that
 * path never uses. That objection does not survive contact with this
 * application. Refresh token rotation runs inside a transaction, and an access
 * token lives fifteen minutes, so anybody using the service for longer than
 * that reaches a transaction whether or not they ever touch a CSV import. A
 * standalone does not break an edge case here. It breaks every session that
 * outlives one access token.
 *
 * So warning and continuing does not buy a working service. It buys a service
 * that works for fifteen minutes and then fails, at a moment disconnected from
 * the cause, with a driver message that actively misdirects: it advises
 * `retryWrites=false`, which disables an unrelated retry layer and moves the
 * same failure one step later. That is the exact afternoon this check exists to
 * prevent, and a warning in a log nobody reads at boot does not prevent it.
 *
 * **Why this is consistent rather than strict.**
 *
 * It is the position the rest of this codebase already takes with
 * configuration. A missing or malformed environment variable stops the process
 * instead of surfacing at the first request that needs it, on the grounds that
 * a boot failure is read by whoever caused it while a runtime 500 is read by a
 * user. A database that cannot honour the guarantees the code is written
 * against is the same category of problem as a variable that is not set.
 *
 * **What it costs in practice.**
 *
 * Almost nothing. Every deployed environment uses Atlas, which is always a
 * replica set, so this can only fire locally. Locally the fix is three commands
 * once per machine, and the error message names them. Compose already starts a
 * single node set and initiates it in its healthcheck, so the documented setup
 * has never been affected.
 *
 * @param _nodeEnv - The environment the process is running in. Unused: the answer does not vary.
 * @returns The policy to apply, which is always to refuse.
 */
export const resolveTopologyPolicy = (_nodeEnv: NodeEnvEnum): TopologyPolicyEnum => TopologyPolicyEnum.REFUSE_TO_BOOT;

/**
 * Verifies at boot that the connected deployment can run transactions.
 *
 * @remarks
 * Transactions are not an optimisation here. Refresh token rotation and CSV
 * import both depend on them, and so does every audit entry written with
 * `recordWithin`, which is what makes "a financial change is always audited" a
 * structural guarantee rather than a convention.
 *
 * A standalone `mongod` accepts the connection, serves every read, and serves
 * every single document write. It fails only when a transaction starts, and the
 * driver reports that failure as:
 *
 * ```text
 * This MongoDB deployment does not support retryable writes.
 * Please add retryWrites=false to your connection string.
 * ```
 *
 * That advice is misleading. Disabling retryable writes silences the retry layer
 * and moves the same failure one step later, into the transaction itself.
 *
 * `hello` is the check because it is unauthenticated, cheap, and returns
 * `setName` only for a replica set member. Its absence is the signal.
 *
 * @see {@link withTransaction} for the callers that depend on this holding.
 */
@Injectable()
export class TopologyCheck implements OnApplicationBootstrap {
  private readonly logger = new Logger(TopologyCheck.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Reads the deployment's topology and applies the environment's policy.
   *
   * @steps
   * 1. Ask the deployment for its replica set name.
   * 2. Return quietly when there is one. Transactions are available.
   * 3. Otherwise resolve the policy for this environment.
   * 4. Log the cause and the remedy, then stop or continue accordingly.
   *
   * @returns Nothing, once the deployment has been accepted.
   * @throws Error When the policy refuses a deployment without transactions.
   */
  public async onApplicationBootstrap(): Promise<void> {
    const setName = await this.readReplicaSetName();

    if (setName !== null) {
      this.logger.log(`[TopologyCheck] - connected to replica set "${setName}", transactions available`);

      return;
    }

    const { nodeEnv } = this.configService.getOrThrow<IAppConfig>('app');
    const policy = resolveTopologyPolicy(nodeEnv);

    // Written out in full rather than pointing at documentation, because this
    // is read by somebody whose service will not start, and the whole reason
    // this check exists is that the driver's own message sends them the wrong
    // way. It says what is wrong, what depends on it, and the two commands that
    // fix it. Anything shorter would be a nicer version of the message that
    // cost an afternoon.
    const message = [
      'MongoDB is a standalone deployment and cannot run transactions.',
      'Refresh token rotation and CSV import both require them, so this service would start and then fail on those routes.',
      'Fix it either way:',
      '`docker compose up -d`, which starts a single node replica set and initiates it;',
      'or add `replication.replSetName: rs0` to your mongod configuration, restart it, and run `rs.initiate()` once.',
      'A single node replica set is a real replica set: transactions need the oplog, not multiple machines.',
    ].join(' ');

    if (policy === TopologyPolicyEnum.REFUSE_TO_BOOT) {
      this.logger.error(`[TopologyCheck] - ${message}`);

      throw new Error(message);
    }

    this.logger.warn(`[TopologyCheck] - ${message}`);
  }

  /**
   * Asks the deployment whether it belongs to a replica set.
   *
   * @remarks
   * The connection string is never logged and never included in an error. It
   * carries credentials in every deployed environment.
   *
   * @returns The replica set name, or `null` for a standalone deployment.
   */
  private async readReplicaSetName(): Promise<string | null> {
    const database = this.connection.db;

    if (database === undefined) {
      return null;
    }

    const response = await database.admin().command({ hello: 1 });
    const setName: unknown = response['setName'];

    return typeof setName === 'string' ? setName : null;
  }
}
