/**
 * Application-wide constants. Values that a deployment may need to change live
 * in environment configuration instead (see `src/config`).
 */

/** Mounted API prefix. All routes are served under this path. */
export const API_PREFIX = 'api/v1';

/** API version tag surfaced in Swagger and health responses. */
export const API_VERSION = 'v1';

/** Correlation id header. Accepted from callers, generated when absent. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Header used to select the acting organization on routes that are not nested
 * under `/organizations/:organizationId`. A `organizationId` query parameter is
 * also accepted; membership is always verified server-side.
 */
export const ORGANIZATION_ID_HEADER = 'x-organization-id';

/** Header carrying an SDK ingestion key. `Authorization: Bearer <key>` also works. */
export const API_KEY_HEADER = 'x-api-key';

/** Human-readable prefix of every generated SDK key. */
export const API_KEY_TOKEN_PREFIX = 'aclp';

/** Only currency supported in this phase. */
export const DEFAULT_CURRENCY = 'USD';

/** Scale used for Decimal money columns (matches `@db.Decimal(20, 10)`). */
export const MONEY_DECIMAL_PLACES = 10;

/** Tokens-per-unit divisor for provider rates expressed per million tokens. */
export const TOKENS_PER_PRICING_UNIT = 1_000_000;

/** Maximum number of key/value pairs accepted in sanitized event metadata. */
export const MAX_METADATA_KEYS = 32;

/** Maximum serialized size (bytes) of sanitized event metadata. */
export const MAX_METADATA_BYTES = 4096;

/** Maximum accepted string length for a single metadata value. */
export const MAX_METADATA_VALUE_LENGTH = 512;

/**
 * Usage events further in the future than this are rejected (clock-skew guard).
 */
export const MAX_EVENT_CLOCK_SKEW_MS = 10 * 60 * 1000;

/** Usage events older than this are rejected as implausible backfill. */
export const MAX_EVENT_AGE_MS = 90 * 24 * 60 * 60 * 1000;
