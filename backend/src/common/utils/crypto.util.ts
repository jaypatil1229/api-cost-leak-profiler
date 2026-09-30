import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Cryptographically secure URL-safe random string. */
export function randomToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

/**
 * Lower-case alphanumeric identifier used for public, non-secret key prefixes.
 * Avoids look-alike characters so a key prefix can be read aloud/typed.
 */
const PREFIX_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function randomIdentifier(length = 12): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += PREFIX_ALPHABET[bytes[i] % PREFIX_ALPHABET.length];
  }
  return out;
}

/** SHA-256 hex digest. Used for refresh/invitation tokens (high-entropy inputs). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Keyed HMAC-SHA256 hex digest. Used for API key secrets so that a database
 * leak alone is not sufficient to forge a key — the pepper lives in config.
 */
export function hmacSha256Hex(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

/**
 * Constant-time comparison of two hex digests. Returns false for length
 * mismatches without leaking timing information about content.
 */
export function safeCompareHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length === 0 || bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
