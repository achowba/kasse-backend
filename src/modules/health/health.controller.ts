import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorResult,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { ApiVersionEnum } from '@common/enums';

/** Heap ceiling above which the process is considered unhealthy. */
const HEAP_LIMIT_BYTES = 512 * 1024 * 1024;

/**
 * Liveness and readiness probes.
 *
 * @remarks
 * Two endpoints because they answer different questions. Liveness asks whether
 * the process should be restarted; it must not depend on anything external, or a
 * database blip would restart every healthy instance. Readiness asks whether this
 * instance should receive traffic, and may check its dependencies.
 */
@ApiTags('Health')
@Controller({ path: 'health', version: ApiVersionEnum.V1 })
export class HealthController {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly memoryHealthIndicator: MemoryHealthIndicator,
  ) {}

  /**
   * Reports that the process is up and serving.
   *
   * @returns An `ok` result. Deliberately checks nothing external.
   */
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness probe', description: 'Answers whether the process is running. Checks no dependency.' })
  async liveness(): Promise<HealthCheckResult> {
    return await this.healthCheckService.check([]);
  }

  /**
   * Reports whether this instance should receive traffic.
   *
   * @remarks
   * Currently heap only. The database indicator is added with the persistence
   * layer, at which point the container healthcheck moves from a TCP connect to
   * this endpoint.
   *
   * @returns The aggregated result of every readiness indicator.
   */
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe', description: 'Answers whether this instance can serve requests.' })
  async readiness(): Promise<HealthCheckResult> {
    return await this.healthCheckService.check([
      async (): Promise<HealthIndicatorResult> => await this.memoryHealthIndicator.checkHeap('memory_heap', HEAP_LIMIT_BYTES),
    ]);
  }
}
