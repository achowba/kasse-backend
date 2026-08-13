import { Module } from '@nestjs/common';

/**
 * Root application module.
 *
 * Wiring only. It composes platform and feature modules and holds no logic of
 * its own, so the dependency graph of the whole service is readable in one
 * place. Feature modules own their controllers, services, and schemas.
 */
@Module({
  imports: [],
})
export class AppModule {}
