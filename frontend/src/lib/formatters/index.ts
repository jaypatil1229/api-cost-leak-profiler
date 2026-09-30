import { format, formatDistanceStrict, parseISO } from "date-fns";

export const SAMPLE_NOW = new Date("2026-09-30T18:00:00");

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const currencyCompactFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const integerFormatter = new Intl.NumberFormat("en-US");
const decimalFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatCurrency(value: number, options: { compact?: boolean; precise?: boolean } = {}): string {
  if (options.compact && Math.abs(value) >= 10_000) return currencyCompactFormatter.format(value);
  if (options.precise && Math.abs(value) < 1) return `$${value.toFixed(4)}`;
  return currencyFormatter.format(value);
}

export function formatCurrencyCompact(value: number): string {
  return Math.abs(value) >= 10_000 ? currencyCompactFormatter.format(value) : currencyFormatter.format(value);
}

export function formatTokens(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) return `${decimalFormatter.format(value / 1_000_000_000)}B`;
  if (Math.abs(value) >= 1_000_000) return `${decimalFormatter.format(value / 1_000_000)}M`;
  if (Math.abs(value) >= 1_000) return `${decimalFormatter.format(value / 1_000)}k`;
  return integerFormatter.format(value);
}

export function formatTokensExact(value: number): string {
  return integerFormatter.format(Math.round(value));
}

export function formatNumber(value: number): string {
  return integerFormatter.format(Math.round(value));
}

export function formatDecimal(value: number, digits = 1): string {
  return value.toFixed(digits);
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatSignedPercent(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : parseISO(value);
}

export function formatDate(value: string | Date, pattern = "d MMM yyyy"): string {
  return format(toDate(value), pattern);
}

export function formatDateTime(value: string | Date): string {
  return format(toDate(value), "d MMM yyyy, HH:mm");
}

export function formatTime(value: string | Date): string {
  return format(toDate(value), "HH:mm:ss");
}

export function formatDateRange(from: string | Date, to: string | Date): string {
  const start = toDate(from);
  const end = toDate(to);
  const sameYear = format(start, "yyyy") === format(end, "yyyy");
  return `${format(start, sameYear ? "d MMM" : "d MMM yyyy")} – ${format(end, "d MMM yyyy")}`;
}

export function formatRelativeTime(value: string | Date, now: Date = SAMPLE_NOW): string {
  const target = toDate(value);
  const distance = formatDistanceStrict(target, now);
  return target.getTime() <= now.getTime() ? `${distance} ago` : `in ${distance}`;
}

export function formatLatency(milliseconds: number): string {
  if (milliseconds >= 60_000) return `${(milliseconds / 60_000).toFixed(1)}m`;
  if (milliseconds >= 1_000) return `${(milliseconds / 1_000).toFixed(milliseconds >= 10_000 ? 0 : 1)}s`;
  return `${Math.round(milliseconds)}ms`;
}

export function formatTokensPerRequest(tokens: number): string {
  return `${formatTokens(tokens)} tok/req`;
}

export function formatChangePhrase(changePct: number): string {
  if (changePct > 0.5) return "higher than the previous period";
  if (changePct < -0.5) return "lower than the previous period";
  return "in line with the previous period";
}

export function formatPercentOfTotal(share: number, digits = 1): string {
  return `${share.toFixed(digits)}%`;
}
