import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_BUCKET_KEY = 'aclp:rateLimitBucket';

/**
 * Named rate-limit buckets configured through the environment.
 *  * `auth`   — login/register/refresh: low limit, keyed by IP + identifier.
 *  * `ingest` — SDK ingestion: high limit, keyed by API key prefix (falls back to IP).
 */
export type RateLimitBucketName = 'auth' | 'ingest';

/**
 * Applies a stricter, endpoint-specific limit via `StrictRateLimitGuard`.
 * Pair with `@SkipThrottle()` so the coarse global limiter does not
 * double-count the same request.
 */
export const RateLimitBucket = (bucket: RateLimitBucketName) =>
  SetMetadata(RATE_LIMIT_BUCKET_KEY, bucket);
