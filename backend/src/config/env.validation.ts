import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

import { parseDurationToSeconds } from '../common/utils/duration.util';

export enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  return value;
};

const toInt = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : value;
};

const trimOrUndefined = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

/**
 * Declarative contract for every environment variable the backend reads.
 *
 * Validation runs once at bootstrap. A malformed or missing required variable
 * aborts startup with a readable list of problems rather than failing later
 * inside a request handler.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  APP_URL = 'http://localhost:3000';

  @Transform(toBoolean)
  @IsBoolean()
  TRUST_PROXY = false;

  // --- logging -------------------------------------------------------------

  @IsIn(LOG_LEVELS)
  LOG_LEVEL: LogLevel = 'info';

  @Transform(toBoolean)
  @IsBoolean()
  LOG_PRETTY = false;

  // --- database ------------------------------------------------------------

  /**
   * Optional so the app can boot for schema work, docs and liveness checks
   * before Postgres exists. See REQUIRE_DATABASE.
   */
  @Transform(trimOrUndefined)
  @IsOptional()
  @IsString()
  DATABASE_URL?: string;

  /**
   * When true the process exits at startup if the database cannot be reached.
   * Defaults to true outside development/test (applied in `buildConfig`).
   */
  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  REQUIRE_DATABASE?: boolean;

  // --- auth ----------------------------------------------------------------

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters.' })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters.' })
  JWT_REFRESH_SECRET!: string;

  @IsString()
  ACCESS_TOKEN_TTL = '15m';

  @IsString()
  REFRESH_TOKEN_TTL = '30d';

  @IsString()
  @MaxLength(64)
  JWT_ISSUER = 'aclp';

  @IsString()
  @MaxLength(64)
  JWT_AUDIENCE = 'aclp-api';

  @IsString()
  @MinLength(32, { message: 'API_KEY_HMAC_SECRET must be at least 32 characters.' })
  API_KEY_HMAC_SECRET!: string;

  @Transform(toBoolean)
  @IsBoolean()
  AUTO_CREATE_ORGANIZATION_ON_REGISTER = true;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  INVITATION_TTL_HOURS = 168;

  // --- http ----------------------------------------------------------------

  @IsString()
  CORS_ORIGINS = '';

  @IsString()
  BODY_LIMIT = '256kb';

  @IsString()
  INGEST_BODY_LIMIT = '1mb';

  // --- rate limiting -------------------------------------------------------

  @Transform(toInt)
  @IsInt()
  @Min(1000)
  RATE_LIMIT_TTL = 60_000;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  RATE_LIMIT_LIMIT = 300;

  @Transform(toInt)
  @IsInt()
  @Min(1000)
  AUTH_RATE_LIMIT_TTL = 60_000;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  AUTH_RATE_LIMIT_LIMIT = 10;

  @Transform(toInt)
  @IsInt()
  @Min(1000)
  INGEST_RATE_LIMIT_TTL = 60_000;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  INGEST_RATE_LIMIT_LIMIT = 600;

  // --- limits --------------------------------------------------------------

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(5000)
  INGEST_MAX_BATCH_SIZE = 500;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(500)
  DEFAULT_PAGE_SIZE = 25;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(1000)
  MAX_PAGE_SIZE = 200;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(1830)
  MAX_QUERY_WINDOW_DAYS = 366;

  @Transform(toInt)
  @IsInt()
  @Min(0)
  API_KEY_LAST_USED_THROTTLE_SECONDS = 300;

  // --- analytics service ---------------------------------------------------

  @Transform(trimOrUndefined)
  @IsOptional()
  @IsString()
  ANALYTICS_SERVICE_URL?: string;

  @Transform(trimOrUndefined)
  @IsOptional()
  @IsString()
  ANALYTICS_SERVICE_TOKEN?: string;

  @Transform(toInt)
  @IsInt()
  @Min(1000)
  @Max(120_000)
  ANALYTICS_SERVICE_TIMEOUT_MS = 15_000;

  // --- docs ----------------------------------------------------------------

  @Transform(toBoolean)
  @IsBoolean()
  SWAGGER_ENABLED = true;

  @IsString()
  SWAGGER_PATH = 'docs';
}

/**
 * Validates `process.env` against {@link EnvironmentVariables}.
 * Registered with `ConfigModule.forRoot({ validate })`.
 */
export function validateEnvironment(raw: Record<string, unknown>): EnvironmentVariables {
  const config = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
    excludeExtraneousValues: false,
  });

  const errors = validateSync(config, {
    skipMissingProperties: false,
    whitelist: false,
    forbidUnknownValues: false,
  });

  const problems: string[] = errors.flatMap((error) =>
    Object.values(error.constraints ?? {}).map((message) => `  - ${message}`),
  );

  // TTLs are strings in the environment; verify they parse before the app runs.
  for (const key of ['ACCESS_TOKEN_TTL', 'REFRESH_TOKEN_TTL'] as const) {
    const value = config[key];
    if (typeof value === 'string') {
      try {
        parseDurationToSeconds(value);
      } catch (error) {
        problems.push(`  - ${key}: ${(error as Error).message}`);
      }
    }
  }

  if (config.MAX_PAGE_SIZE < config.DEFAULT_PAGE_SIZE) {
    problems.push('  - MAX_PAGE_SIZE must be greater than or equal to DEFAULT_PAGE_SIZE.');
  }

  if (
    config.NODE_ENV === NodeEnvironment.Production &&
    config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET
  ) {
    problems.push('  - JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ in production.');
  }

  if (config.NODE_ENV === NodeEnvironment.Production && config.CORS_ORIGINS.trim() === '*') {
    problems.push('  - CORS_ORIGINS must not be "*" in production.');
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${problems.join('\n')}\n` +
        'See backend/.env.example for every supported variable.',
    );
  }

  return config;
}
