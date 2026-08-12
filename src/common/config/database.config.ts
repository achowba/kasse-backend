import { registerAs } from '@nestjs/config';
import { IDatabaseConfig } from './config.interface';

/**
 * Builds the `database` configuration namespace from the validated environment.
 *
 * @remarks
 * `autoIndex` is on in every environment. Mongoose then creates the declared
 * indexes at startup, which matters here because several of them are not
 * performance tuning: the unique index on user, category, and month is what
 * enforces one plan per cell. At a data volume where building indexes at boot
 * becomes slow, this moves to a migration step and this flag goes off.
 *
 * @returns The resolved database configuration.
 */
export const databaseConfig = registerAs('database', (): IDatabaseConfig => ({
  uri: process.env['MONGODB_URI'] ?? '',
  autoIndex: true,
}));
