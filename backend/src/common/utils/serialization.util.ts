import { isDecimal } from './money.util';

const MAX_DEPTH = 12;

/**
 * Defensive JSON normaliser applied to every outgoing response body.
 *
 * Service-layer mappers are the primary place where Prisma `Decimal` values are
 * converted to strings; this walker is a safety net so a value that slips
 * through a mapper is still serialised as a lossless string instead of
 * `{ "s": 1, "e": -3, "d": [...] }` (how decimal.js serialises by default) or a
 * lossy float. `BigInt` (returned by some raw aggregate queries) is handled too
 * because `JSON.stringify` throws on it.
 */
export function normalizeForJson(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }
  if (depth > MAX_DEPTH) {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (isDecimal(value)) {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForJson(item, depth + 1));
  }
  if (typeof value === 'object') {
    // Leave class instances that define their own serialisation alone.
    const proto = Object.getPrototypeOf(value) as object | null;
    if (proto !== null && proto !== Object.prototype && !isPlainDataClass(value)) {
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = normalizeForJson(item, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * DTO/view-model classes are plain data holders: they have no `toJSON` and no
 * methods we need to preserve, so it is safe to walk into them.
 */
function isPlainDataClass(value: object): boolean {
  return typeof (value as { toJSON?: unknown }).toJSON !== 'function';
}
