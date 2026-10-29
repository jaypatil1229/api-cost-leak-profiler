export interface DetectionRunSnapshot {
  status: string;
}

export interface DetectionPollingOptions {
  maxAttempts?: number;
  intervalMs?: number;
  wait?: (milliseconds: number) => Promise<void>;
}

const waitForInterval = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Poll a persisted run a bounded number of times, returning its latest state. */
export async function pollDetectionRun<T extends DetectionRunSnapshot>(
  fetchRun: () => Promise<T>,
  options: DetectionPollingOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 30;
  const intervalMs = options.intervalMs ?? 1_000;
  const wait = options.wait ?? waitForInterval;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError('maxAttempts must be a positive integer.');
  }

  let latest: T | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) await wait(intervalMs);
    latest = await fetchRun();
    if (latest.status === 'COMPLETED' || latest.status === 'FAILED') return latest;
  }

  return latest!;
}
