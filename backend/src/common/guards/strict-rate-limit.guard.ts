import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { APP_CONFIG } from '../../config/config.module';
import type { Configuration, RateLimitRule } from '../../config/configuration';
import { API_KEY_HEADER } from '../constants/app.constants';
import { ErrorCode } from '../constants/error-codes';
import { RATE_LIMIT_BUCKET_KEY, type RateLimitBucketName } from '../decorators/throttle.decorators';
import { AppException } from '../exceptions/app.exception';
import type { RequestContext } from '../types/request-context';
import { parseApiKey } from '../utils/api-key.util';

interface Counter {
  count: number;
  resetAt: number;
}

/** Counters are swept on this cadence so the map cannot grow without bound. */
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Endpoint-specific limiter for the two abuse-sensitive surfaces: credential
 * endpoints and SDK ingestion. It is intentionally separate from the coarse
 * global `ThrottlerGuard` so that the limits, and the key each is counted
 * against, can differ:
 *
 *  * `auth`   — counted per client IP **and** submitted identifier, so one
 *               attacker cannot lock out an account by guessing from many IPs,
 *               and one IP cannot spray many accounts.
 *  * `ingest` — counted per presented API key **prefix** (public, non-secret)
 *               falling back to IP, so one noisy project cannot exhaust the
 *               budget of another. Deliberately ordered *before*
 *               `ApiKeyAuthGuard` so invalid-key floods are also limited.
 *
 * Storage is in-process, matching the project constraint of no Redis in the
 * initial foundation. LIMITATION: with more than one instance the effective
 * limit is `limit × instances`, and counters reset on deploy. Moving to a
 * shared store is a documented follow-up (see README, "Known limitations").
 */
@Injectable()
export class StrictRateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly counters = new Map<string, Counter>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: Configuration,
  ) {
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    // Never keep the event loop alive for housekeeping.
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweepTimer);
    this.counters.clear();
  }

  canActivate(context: ExecutionContext): boolean {
    const bucket = this.reflector.getAllAndOverride<RateLimitBucketName | undefined>(
      RATE_LIMIT_BUCKET_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Without an explicit bucket this guard is a no-op; the global limiter applies.
    if (!bucket) {
      return true;
    }

    const rule = this.config.rateLimit[bucket];
    const request = context.switchToHttp().getRequest<RequestContext>();
    const key = `${bucket}:${this.trackerFor(bucket, request)}`;

    const retryAfterSeconds = this.consume(key, rule);
    if (retryAfterSeconds !== null) {
      const response = context.switchToHttp().getResponse<{
        setHeader?: (name: string, value: string) => void;
      }>();
      response.setHeader?.('Retry-After', String(retryAfterSeconds));
      throw new AppException(HttpStatus.TOO_MANY_REQUESTS, {
        code: ErrorCode.RATE_LIMITED,
        message: 'Too many requests. Please retry later.',
        details: { retryAfterSeconds },
      });
    }

    return true;
  }

  /**
   * Fixed-window counter. Returns `null` when the request is allowed, or the
   * number of seconds until the window resets when it is not.
   */
  private consume(key: string, rule: RateLimitRule): number | null {
    const now = Date.now();
    const existing = this.counters.get(key);

    if (!existing || existing.resetAt <= now) {
      this.counters.set(key, { count: 1, resetAt: now + rule.ttlMs });
      return null;
    }

    if (existing.count >= rule.limit) {
      return Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    }

    existing.count += 1;
    return null;
  }

  private trackerFor(bucket: RateLimitBucketName, request: RequestContext): string {
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    if (bucket === 'ingest') {
      return this.apiKeyPrefixFrom(request) ?? `ip:${ip}`;
    }
    return `ip:${ip}|id:${this.identifierFrom(request)}`;
  }

  /**
   * Public key prefix of the presented credential, without verifying it.
   * Only the non-secret half is ever used as a counter key.
   */
  private apiKeyPrefixFrom(request: RequestContext): string | null {
    const header = request.headers[API_KEY_HEADER];
    const raw =
      typeof header === 'string'
        ? header
        : typeof request.headers.authorization === 'string'
          ? request.headers.authorization.replace(/^Bearer\s+/i, '')
          : undefined;
    if (!raw) {
      return null;
    }
    const parsed = parseApiKey(raw);
    return parsed ? `key:${parsed.keyPrefix}` : null;
  }

  /**
   * Lower-cased submitted email, when present. Used only as a hash-free counter
   * key and never logged by this guard.
   */
  private identifierFrom(request: RequestContext): string {
    const body: unknown = request.body;
    if (body && typeof body === 'object' && 'email' in body) {
      const email = (body as { email?: unknown }).email;
      if (typeof email === 'string' && email.length <= 320) {
        return email.trim().toLowerCase();
      }
    }
    return '-';
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, counter] of this.counters) {
      if (counter.resetAt <= now) {
        this.counters.delete(key);
      }
    }
  }
}
