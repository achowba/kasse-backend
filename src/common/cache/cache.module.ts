import { Global, Module } from '@nestjs/common';
import { DataVersionService } from './data-version.service';

/**
 * Cache invalidation shared by the modules that write financial data and the one
 * that reports on it.
 *
 * @remarks
 * Global, because every writer needs it and threading an import through four
 * feature modules to share one counter would be noise. It holds no domain logic,
 * which is what makes that acceptable.
 */
@Global()
@Module({
  providers: [DataVersionService],
  exports: [DataVersionService],
})
export class CacheModule {}
