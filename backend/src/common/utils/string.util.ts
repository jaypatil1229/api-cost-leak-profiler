/** Normalises an email for storage and lookup: trimmed and lower-cased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Builds a URL-safe slug. Returns an empty string when nothing usable remains,
 * so callers can fall back to a generated identifier rather than persisting "".
 */
export function slugify(value: string, maxLength = 64): string {
  return value
    .normalize('NFKD')
    // Drop combining diacritical marks left behind by NFKD normalisation.
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Guards against sending non-UUID text to a `@db.Uuid` column, which Postgres
 * rejects with a driver-level error rather than an empty result.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Truncates to `maxLength`, returning undefined for empty/blank input. */
export function trimToLength(value: string | undefined | null, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed.slice(0, maxLength);
}
