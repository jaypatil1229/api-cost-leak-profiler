import {
  MAX_METADATA_BYTES,
  MAX_METADATA_KEYS,
  MAX_METADATA_VALUE_LENGTH,
} from '../constants/app.constants';

/**
 * Keys whose values are dropped outright. ACLP never needs provider
 * credentials, and accepting them by accident would put secrets in our database
 * and in customer-visible reports.
 */
const BLOCKED_KEY_PATTERN =
  /(api[-_]?key|secret|password|passwd|authorization|(^|[-_])token($|[-_])|auth[-_]?token|access[-_]?token|refresh[-_]?token|bearer|credential|private[-_]?key|session[-_]?token|cookie)/i;

/**
 * Keys that would smuggle raw prompt/completion text into metadata. ACLP stores
 * hashes and counts, not content, so these are rejected as well.
 */
const CONTENT_KEY_PATTERN = /^(prompt|completion|messages?|input|output|content|text|response)$/i;

export type SanitizedMetadataValue = string | number | boolean | null;

export interface SanitizeMetadataResult {
  /** `null` when nothing survived sanitisation. */
  metadata: Record<string, SanitizedMetadataValue> | null;
  /** Human-readable notes returned to the SDK so integrators can fix payloads. */
  warnings: string[];
}

/**
 * Normalises SDK-supplied metadata into a flat, bounded, secret-free map.
 *
 * Nested structures are rejected rather than flattened: allowing arbitrary
 * depth makes size bounds and redaction unreliable.
 */
export function sanitizeMetadata(input: unknown): SanitizeMetadataResult {
  const warnings: string[] = [];

  if (input === null || input === undefined) {
    return { metadata: null, warnings };
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { metadata: null, warnings: ['metadata must be a flat JSON object; value ignored'] };
  }

  const out: Record<string, SanitizedMetadataValue> = {};
  let keptKeys = 0;

  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (key.length === 0 || key.length > 64) {
      warnings.push(`metadata key "${rawKey.slice(0, 32)}" ignored: invalid key length`);
      continue;
    }
    if (BLOCKED_KEY_PATTERN.test(key)) {
      warnings.push(`metadata key "${key}" ignored: keys that may carry credentials are rejected`);
      continue;
    }
    if (CONTENT_KEY_PATTERN.test(key)) {
      warnings.push(
        `metadata key "${key}" ignored: ACLP does not store prompt or completion content`,
      );
      continue;
    }
    if (keptKeys >= MAX_METADATA_KEYS) {
      warnings.push(`metadata truncated: at most ${MAX_METADATA_KEYS} keys are stored`);
      break;
    }

    const value = coerceValue(rawValue);
    if (value === undefined) {
      warnings.push(
        `metadata key "${key}" ignored: only string, number, boolean and null values are stored`,
      );
      continue;
    }

    out[key] = value;
    keptKeys += 1;
  }

  if (keptKeys === 0) {
    return { metadata: null, warnings };
  }

  const trimmed = enforceByteBudget(out, warnings);
  return { metadata: Object.keys(trimmed).length > 0 ? trimmed : null, warnings };
}

function coerceValue(value: unknown): SanitizedMetadataValue | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    return value.length > MAX_METADATA_VALUE_LENGTH
      ? value.slice(0, MAX_METADATA_VALUE_LENGTH)
      : value;
  }
  return undefined;
}

function enforceByteBudget(
  value: Record<string, SanitizedMetadataValue>,
  warnings: string[],
): Record<string, SanitizedMetadataValue> {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') <= MAX_METADATA_BYTES) {
    return value;
  }

  const out: Record<string, SanitizedMetadataValue> = {};
  for (const [key, item] of Object.entries(value)) {
    const candidate = { ...out, [key]: item };
    if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') > MAX_METADATA_BYTES) {
      warnings.push(`metadata truncated: serialized size exceeds ${MAX_METADATA_BYTES} bytes`);
      break;
    }
    out[key] = item;
  }
  return out;
}
