import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

/**
 * Exposes the liveness and readiness probes.
 *
 * @remarks
 * Depends on nothing in this project beyond Terminus, so a failure elsewhere
 * cannot stop the probes from answering.
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
