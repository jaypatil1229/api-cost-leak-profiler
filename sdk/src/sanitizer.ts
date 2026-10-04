// src/sanitizer.ts

/**
 * Keys whose values are dropped outright. ACLP never needs provider
 * credentials or secrets, and accepting them by accident would leak
 * sensitive information into telemetry.
 */
const BLOCKED_KEY_PATTERN =
  /(api[-_]?key|secret|password|passwd|authorization|(^|[-_])token($|[-_])|auth[-_]?token|access[-_]?token|refresh[-_]?token|bearer|credential|private[-_]?key|session[-_]?token|cookie)/i;

/**
 * Keys that would smuggle raw prompt/completion text into metadata.
 * ACLP stores hashes and counts, not content.
 */
const CONTENT_KEY_PATTERN =
  /^(prompt|completion|messages?|input|output|content|text|response)$/i;

const MAX_METADATA_KEYS = 32;
const MAX_METADATA_VALUE_LENGTH = 128;
const MAX_KEY_LENGTH = 64;

/**
 * Sanitizes customer-supplied metadata client-side before queueing.
 *
 * Drops credential-bearing keys and content keys, bounds key/value lengths,
 * and restricts entries to primitive types.
 */
export function sanitizeMetadata(
  input?: Record<string, unknown> | null
): Record<string, string> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const result: Record<string, string> = {};
  let count = 0;

  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = rawKey.trim();
    if (key.length === 0 || key.length > MAX_KEY_LENGTH) {
      continue;
    }
    if (BLOCKED_KEY_PATTERN.test(key)) {
      continue;
    }
    if (CONTENT_KEY_PATTERN.test(key)) {
      continue;
    }
    if (count >= MAX_METADATA_KEYS) {
      break;
    }

    if (rawValue === null || rawValue === undefined) {
      continue;
    }

    // Do not permit arbitrary nested objects/arrays
    if (typeof rawValue === "object") {
      continue;
    }

    let strVal = String(rawValue);
    if (strVal.length > MAX_METADATA_VALUE_LENGTH) {
      strVal = strVal.slice(0, MAX_METADATA_VALUE_LENGTH);
    }

    result[key] = strVal;
    count++;
  }

  return count > 0 ? result : undefined;
}
