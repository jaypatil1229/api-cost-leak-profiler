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
