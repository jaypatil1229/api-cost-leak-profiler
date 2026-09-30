import { API_KEY_TOKEN_PREFIX } from '../constants/app.constants';

import { hmacSha256Hex, randomIdentifier, randomToken, safeCompareHex } from './crypto.util';

/** Length of the public, non-secret key prefix stored in the database. */
export const API_KEY_PREFIX_LENGTH = 12;

/** Entropy of the secret half of an SDK key. */
const API_KEY_SECRET_BYTES = 32;

/**
 * Presented key format: `aclp_<prefix>_<secret>`.
 *
 *  * `prefix` is public. It is stored in plaintext and uniquely indexed so a
 *    presented key can be looked up with one indexed read.
 *  * `secret` is never stored — only `HMAC-SHA256(secret, API_KEY_HMAC_SECRET)`.
 *
 * The regex is anchored and only allows base64url characters in the secret, so
 * the underscores inside a base64url secret cannot confuse the split.
 */
const API_KEY_PATTERN = new RegExp(
  `^${API_KEY_TOKEN_PREFIX}_([a-z0-9]{${API_KEY_PREFIX_LENGTH}})_([A-Za-z0-9_-]{16,})$`,
);

export interface GeneratedApiKey {
  /** Full key. Returned to the caller exactly once, never persisted. */
  plaintext: string;
  keyPrefix: string;
  keyHash: string;
}

export interface ParsedApiKey {
  keyPrefix: string;
  secret: string;
}

/** Generates a new SDK key and the hash to persist for it. */
export function generateApiKey(pepper: string): GeneratedApiKey {
  const keyPrefix = randomIdentifier(API_KEY_PREFIX_LENGTH);
  const secret = randomToken(API_KEY_SECRET_BYTES);
  return {
    plaintext: `${API_KEY_TOKEN_PREFIX}_${keyPrefix}_${secret}`,
    keyPrefix,
    keyHash: hmacSha256Hex(secret, pepper),
  };
}

/**
 * Splits a presented key without touching the database. Returns `null` for any
 * malformed input so callers can reject early without a query.
 */
export function parseApiKey(raw: string): ParsedApiKey | null {
  const match = API_KEY_PATTERN.exec(raw.trim());
  if (!match) {
    return null;
  }
  return { keyPrefix: match[1], secret: match[2] };
}

/** Constant-time verification of a presented secret against a stored hash. */
export function verifyApiKeySecret(secret: string, storedHash: string, pepper: string): boolean {
  return safeCompareHex(hmacSha256Hex(secret, pepper), storedHash);
}

/**
 * Display form shown in key lists, e.g. `aclp_a7k3m9x2qp4t…`.
 * Contains only the public prefix — never any part of the secret.
 */
export function maskedApiKey(keyPrefix: string): string {
  return `${API_KEY_TOKEN_PREFIX}_${keyPrefix}_…`;
}
