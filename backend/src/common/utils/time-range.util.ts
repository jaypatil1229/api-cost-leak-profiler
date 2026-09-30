import { BadRequestException } from '@nestjs/common';

import { ErrorCode } from '../constants/error-codes';

/** Time bucket granularity for time-series endpoints. */
export const TimeGranularity = {
  HOUR: 'hour',
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
} as const;

export type TimeGranularityValue = (typeof TimeGranularity)[keyof typeof TimeGranularity];

export interface ResolvedTimeRange {
  from: Date;
  to: Date;
  /** Length of the window in milliseconds (`to - from`). */
  durationMs: number;
}

export interface ComparisonTimeRange extends ResolvedTimeRange {
  /** The immediately preceding window of equal length, for period-over-period deltas. */
  previous: ResolvedTimeRange;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Maximum number of buckets a single time-series response may contain. Prevents
 * "1 year at hourly granularity" from producing an 8760-row payload.
 */
export const MAX_TIMESERIES_BUCKETS = 1500;

const GRANULARITY_APPROX_MS: Record<TimeGranularityValue, number> = {
  hour: 60 * 60 * 1000,
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 28 * DAY_MS,
};

/**
 * Validates and normalises a `from`/`to` pair.
 *
 * Semantics (documented in the README and Swagger):
 *  * both bounds are absolute instants in **UTC**;
 *  * `from` is inclusive, `to` is exclusive;
 *  * when omitted, the window defaults to the last `defaultWindowDays` days.
 */
export function resolveTimeRange(
  from: Date | undefined,
  to: Date | undefined,
  options: { maxWindowDays: number; defaultWindowDays?: number; now?: Date },
): ResolvedTimeRange {
  const now = options.now ?? new Date();
  const defaultWindowDays = options.defaultWindowDays ?? 30;

  const resolvedTo = to ?? now;
  const resolvedFrom = from ?? new Date(resolvedTo.getTime() - defaultWindowDays * DAY_MS);

  if (Number.isNaN(resolvedFrom.getTime()) || Number.isNaN(resolvedTo.getTime())) {
    throw new BadRequestException({
      code: ErrorCode.INVALID_DATE_RANGE,
      message: '`from` and `to` must be valid ISO-8601 date-times.',
    });
  }
  if (resolvedFrom.getTime() >= resolvedTo.getTime()) {
    throw new BadRequestException({
      code: ErrorCode.INVALID_DATE_RANGE,
      message: '`from` must be strictly earlier than `to`.',
    });
  }

  const durationMs = resolvedTo.getTime() - resolvedFrom.getTime();
  const maxMs = options.maxWindowDays * DAY_MS;
  if (durationMs > maxMs) {
    throw new BadRequestException({
      code: ErrorCode.QUERY_WINDOW_TOO_LARGE,
      message: `Query window of ${Math.ceil(durationMs / DAY_MS)} days exceeds the maximum of ${options.maxWindowDays} days.`,
    });
  }

  return { from: resolvedFrom, to: resolvedTo, durationMs };
}

/** Adds the immediately preceding equal-length window to a resolved range. */
export function withPreviousPeriod(range: ResolvedTimeRange): ComparisonTimeRange {
  const previousTo = range.from;
  const previousFrom = new Date(range.from.getTime() - range.durationMs);
  return {
    ...range,
    previous: {
      from: previousFrom,
      to: previousTo,
      durationMs: range.durationMs,
    },
  };
}

/**
 * Rejects granularity/window combinations that would produce an unreasonable
 * number of buckets. Called before issuing the aggregation query so the
 * database is never asked to build the oversized result at all.
 */
export function assertBucketCountWithinLimit(
  range: ResolvedTimeRange,
  granularity: TimeGranularityValue,
): void {
  const approxBuckets = Math.ceil(range.durationMs / GRANULARITY_APPROX_MS[granularity]);
  if (approxBuckets > MAX_TIMESERIES_BUCKETS) {
    throw new BadRequestException({
      code: ErrorCode.QUERY_WINDOW_TOO_LARGE,
      message:
        `A "${granularity}" granularity over this window would produce about ${approxBuckets} buckets ` +
        `(maximum ${MAX_TIMESERIES_BUCKETS}). Use a coarser granularity or a shorter window.`,
    });
  }
}

/**
 * Picks a sensible default granularity for a window length so that callers can
 * omit the parameter and still get a readable series.
 */
export function defaultGranularityFor(range: ResolvedTimeRange): TimeGranularityValue {
  const days = range.durationMs / DAY_MS;
  if (days <= 2) return TimeGranularity.HOUR;
  if (days <= 92) return TimeGranularity.DAY;
  if (days <= 400) return TimeGranularity.WEEK;
  return TimeGranularity.MONTH;
}
