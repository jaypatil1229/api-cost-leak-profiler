import { parseDurationToSeconds } from '../common/utils/duration.util';

import { NodeEnvironment, type EnvironmentVariables, type LogLevel } from './env.validation';

export interface AppConfig {
  env: NodeEnvironment;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  port: number;
  appUrl: string;
  trustProxy: boolean;
}

export interface LoggingConfig {
  level: LogLevel;
  pretty: boolean;
}

export interface DatabaseConfig {
  url?: string;
  /** When true, an unreachable database aborts startup. */
  required: boolean;
}

export interface AuthConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  issuer: string;
  audience: string;
  apiKeyHmacSecret: string;
  autoCreateOrganizationOnRegister: boolean;
  invitationTtlHours: number;
}

export interface HttpConfig {
  corsOrigins: string[];
  /** True when CORS_ORIGINS is "*" — rejected in production by env validation. */
  corsAllowAll: boolean;
  bodyLimit: string;
  ingestBodyLimit: string;
}

export interface RateLimitRule {
  ttlMs: number;
  limit: number;
}

export interface RateLimitConfig {
  default: RateLimitRule;
  auth: RateLimitRule;
  ingest: RateLimitRule;
}

export interface LimitsConfig {
  ingestMaxBatchSize: number;
  defaultPageSize: number;
  maxPageSize: number;
  maxQueryWindowDays: number;
  apiKeyLastUsedThrottleSeconds: number;
}

export interface AnalyticsConfig {
  url?: string;
  token?: string;
  timeoutMs: number;
  /** Convenience flag: the Python analytics service is optional. */
  enabled: boolean;
}

export interface DocsConfig {
  enabled: boolean;
  path: string;
}

export interface Configuration {
  app: AppConfig;
  logging: LoggingConfig;
  database: DatabaseConfig;
  auth: AuthConfig;
  http: HttpConfig;
  rateLimit: RateLimitConfig;
  limits: LimitsConfig;
  analytics: AnalyticsConfig;
  docs: DocsConfig;
}

/**
 * Builds the nested, strongly-typed configuration object consumed by the rest
 * of the application. Nothing outside this file reads `process.env` directly.
 */
export function buildConfiguration(env: EnvironmentVariables): Configuration {
  const isProduction = env.NODE_ENV === NodeEnvironment.Production;
  const isDevelopment = env.NODE_ENV === NodeEnvironment.Development;
  const isTest = env.NODE_ENV === NodeEnvironment.Test;

  const corsOrigins = env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return {
    app: {
      env: env.NODE_ENV,
      isProduction,
      isDevelopment,
      isTest,
      port: env.PORT,
      appUrl: env.APP_URL.replace(/\/+$/, ''),
      trustProxy: env.TRUST_PROXY,
    },
    logging: {
      level: env.LOG_LEVEL,
      pretty: env.LOG_PRETTY,
    },
    database: {
      url: env.DATABASE_URL,
      // Booting without a database is a development affordance only.
      required: env.REQUIRE_DATABASE ?? !(isDevelopment || isTest),
    },
    auth: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTokenTtlSeconds: parseDurationToSeconds(env.ACCESS_TOKEN_TTL),
      refreshTokenTtlSeconds: parseDurationToSeconds(env.REFRESH_TOKEN_TTL),
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      apiKeyHmacSecret: env.API_KEY_HMAC_SECRET,
      autoCreateOrganizationOnRegister: env.AUTO_CREATE_ORGANIZATION_ON_REGISTER,
      invitationTtlHours: env.INVITATION_TTL_HOURS,
    },
    http: {
      corsOrigins: corsOrigins.filter((origin) => origin !== '*'),
      corsAllowAll: corsOrigins.includes('*'),
      bodyLimit: env.BODY_LIMIT,
      ingestBodyLimit: env.INGEST_BODY_LIMIT,
    },
    rateLimit: {
      default: { ttlMs: env.RATE_LIMIT_TTL, limit: env.RATE_LIMIT_LIMIT },
      auth: { ttlMs: env.AUTH_RATE_LIMIT_TTL, limit: env.AUTH_RATE_LIMIT_LIMIT },
      ingest: { ttlMs: env.INGEST_RATE_LIMIT_TTL, limit: env.INGEST_RATE_LIMIT_LIMIT },
    },
    limits: {
      ingestMaxBatchSize: env.INGEST_MAX_BATCH_SIZE,
      defaultPageSize: env.DEFAULT_PAGE_SIZE,
      maxPageSize: env.MAX_PAGE_SIZE,
      maxQueryWindowDays: env.MAX_QUERY_WINDOW_DAYS,
      apiKeyLastUsedThrottleSeconds: env.API_KEY_LAST_USED_THROTTLE_SECONDS,
    },
    analytics: {
      url: env.ANALYTICS_SERVICE_URL,
      token: env.ANALYTICS_SERVICE_TOKEN,
      timeoutMs: env.ANALYTICS_SERVICE_TIMEOUT_MS,
      enabled: Boolean(env.ANALYTICS_SERVICE_URL),
    },
    docs: {
      // Swagger is opt-in in production; it is on by default elsewhere.
      enabled: env.SWAGGER_ENABLED,
      path: env.SWAGGER_PATH.replace(/^\/+|\/+$/g, ''),
    },
  };
}
