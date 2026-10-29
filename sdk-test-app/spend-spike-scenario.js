export const SPEND_SPIKE_BASELINE_WAIT_MS = 15 * 60_000;
export const SPEND_SPIKE_DETECTOR_WINDOW_MS = 10 * 60_000;
export const SPEND_SPIKE_CALLS = 10;
export const SPEND_SPIKE_SOURCE_CHAR_COUNT = 260_000;

export function expandSpendSpikeSource(text) {
  const source = String(text || 'Software engineer resume source material. ').trim() || 'Software engineer resume source material.';
  if (source.length >= SPEND_SPIKE_SOURCE_CHAR_COUNT) return source.slice(0, SPEND_SPIKE_SOURCE_CHAR_COUNT);
  return source.repeat(Math.ceil(SPEND_SPIKE_SOURCE_CHAR_COUNT / source.length)).slice(0, SPEND_SPIKE_SOURCE_CHAR_COUNT);
}

/** Returns which baseline window contains a real baseline event timestamp. */
export function spendSpikeBaselineWindow(baselineAt, detectionEnd, windowMs = SPEND_SPIKE_DETECTOR_WINDOW_MS) {
  const currentStart = detectionEnd - windowMs;
  const previousStart = currentStart - windowMs;
  const olderStart = previousStart - windowMs;
  if (baselineAt >= previousStart && baselineAt < currentStart) return 'immediate-previous';
  if (baselineAt >= olderStart && baselineAt < previousStart) return 'two-windows-ago';
  return null;
}
