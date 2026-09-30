const DURATION_PATTERN = /^(\d+)\s*(ms|s|m|h|d|w)?$/i;

const UNIT_TO_SECONDS: Record<string, number> = {
  ms: 0.001,
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
  w: 7 * 24 * 60 * 60,
};

/**
 * Parses a compact duration string ("900", "15m", "30d") into whole seconds.
 * A bare number is interpreted as seconds.
 *
 * @throws Error when the value cannot be parsed — callers use this at startup
 * so a malformed TTL fails fast with a clear message rather than silently
 * producing a zero-length token lifetime.
 */
export function parseDurationToSeconds(value: string): number {
  const match = DURATION_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(
      `Invalid duration "${value}". Expected a number optionally suffixed with ms|s|m|h|d|w (e.g. "15m", "30d").`,
    );
  }
  const amount = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  const seconds = Math.floor(amount * UNIT_TO_SECONDS[unit]);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Invalid duration "${value}". Resolved to a non-positive number of seconds.`);
  }
  return seconds;
}

/** Returns a Date `seconds` in the future from `from` (defaults to now). */
export function addSeconds(seconds: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + seconds * 1000);
}
