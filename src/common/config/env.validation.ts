import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';
import { NodeEnvEnum } from '@common/enums';
import { MINIMUM_ACCESS_TTL_SECONDS, MINIMUM_KEY_LENGTH, PRIVATE_KEY_MARKER, PUBLIC_KEY_MARKER } from './config.constants';

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

  /*
   * Where this service answers from the outside, used only to make the boot
   * line useful. A process cannot discover its own public address: it sits
   * behind a proxy that rewrites the host, so it has to be told.
   *
   * A protocol is required. A bare domain would produce a link nothing can
   * follow, which is the class of problem this variable exists to fix.
   *
   * `ValidateIf` rather than `IsOptional`, because `IsOptional` skips only
   * `null` and `undefined`. An empty string is a defined value, so the URL
   * rule ran against it and refused the boot. A deployment platform hands
   * over a variable left blank in its UI as exactly that, and `.env.example`
   * ships the key with no value, so copying the example would have made the
   * service unstartable. Empty means absent here, matching `appConfig`.
   */
  @ValidateIf((variables: EnvironmentVariables) => (variables.PUBLIC_URL ?? '') !== '')
  @IsUrl({ require_tld: false, require_protocol: true })
  PUBLIC_URL?: string;

  @IsOptional()
  @IsString()
  LOG_LEVEL?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  /*
   * Optional on purpose. Without it the natural language endpoint answers 503
   * with a clear code and the rest of the API is unaffected, which is what makes
   * the feature safe to ship without provisioning a key everywhere.
   */
  @IsOptional()
  @IsString()
  ANTHROPIC_API_KEY?: string;

  /*
   * Required. Base64 encoded PEM keys: the private key signs access tokens and
   * the public key verifies them. Encoded because a PEM has newlines and an
   * environment variable is one line.
   */
  @IsString()
  @MinLength(MINIMUM_KEY_LENGTH)
  JWT_PRIVATE_KEY!: string;

  @IsString()
  @MinLength(MINIMUM_KEY_LENGTH)
  JWT_PUBLIC_KEY!: string;

  @IsOptional()
  @IsInt()
  @Min(MINIMUM_ACCESS_TTL_SECONDS)
  JWT_ACCESS_TTL_SECONDS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  JWT_REFRESH_TTL_DAYS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_TTL_MS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_THROTTLE_LIMIT?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_THROTTLE_TTL_MS?: number;

  /*
   * Read directly from `process.env` in `@common/throttling`, because `@Throttle`
   * is a decorator and its values are needed when the class is defined, before
   * any injector exists. Declared here anyway.
   *
   * Without these three, `Number('six')` produced `NaN`, the throttler compared
   * every count against it, and every comparison was false. The limit was not
   * merely wrong, it was absent, and the boot said nothing. That is the one place
   * the rule the rest of this file exists to uphold did not hold.
   *
   * Declaring them does not change where the constants read from. It makes a
   * malformed value stop the process, which is the guarantee that matters.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  REPORT_THROTTLE_LIMIT?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  IMPORT_THROTTLE_LIMIT?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  EXPENSIVE_THROTTLE_TTL_MS?: number;
}

/**
 * Fails the boot when an encoded key does not decode to the kind of key it claims to be.
 *
 * @param encoded - The base64 encoded value from the environment.
 * @param marker - The PEM header fragment the decoded value must contain.
 * @param variableName - The variable being checked, for the error message.
 * @throws Error When the value does not decode to a matching PEM.
 */
const assertKeyContains = (encoded: string, marker: string, variableName: string): void => {
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');

  if (!decoded.includes(marker)) {
    throw new Error(`Invalid environment configuration: ${variableName} must be a base64 encoded PEM containing "${marker}".`);
  }
};

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

  // Decode and inspect the keys here rather than discovering at the first login
  // that a variable holds something that is not a key. A base64 blob passes a
  // string check and still fails to sign.
  assertKeyContains(validated.JWT_PRIVATE_KEY, PRIVATE_KEY_MARKER, 'JWT_PRIVATE_KEY');
  assertKeyContains(validated.JWT_PUBLIC_KEY, PUBLIC_KEY_MARKER, 'JWT_PUBLIC_KEY');

  return validated;
};
