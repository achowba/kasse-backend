import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';
import { NodeEnvEnum } from '@common/enums';

/**
 * Shape of the environment this service accepts.
 *
 * @remarks
 * A field becomes required in the release that first depends on it, which keeps
 * a missing variable a boot failure rather than a runtime surprise. Everything
 * still optional carries a documented default.
 */
export class EnvironmentVariables {
  /*
   * Required: the service cannot serve a request without a database, so an
   * absent or empty value is a boot failure rather than a runtime surprise.
   */
  @IsString()
  @IsNotEmpty()
  MONGODB_URI!: string;

  @IsOptional()
  @IsEnum(NodeEnvEnum)
  NODE_ENV?: NodeEnvEnum;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsOptional()
  @IsString()
  LOG_LEVEL?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;
}

/**
 * Validates the raw environment and fails the boot when it is malformed.
 *
 * @remarks
 * Runs once, during `ConfigModule` initialisation. Every error is reported at
 * once rather than one per restart. Implicit conversion turns the string values
 * that a process environment always carries into the numbers and enums declared
 * above.
 *
 * @param config - The raw `process.env` style record supplied by Nest.
 * @returns The validated variables.
 * @throws Error When any variable is missing or malformed, listing every problem.
 */
export const validateEnvironment = (config: Record<string, unknown>): EnvironmentVariables => {
  const validated = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false, whitelist: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .filter(Boolean)
      .join('; ');

    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return validated;
};
