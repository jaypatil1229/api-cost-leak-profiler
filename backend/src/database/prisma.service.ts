import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { APP_CONFIG } from '../config/config.module';
import type { Configuration } from '../config/configuration';

/**
 * Syntactically valid but intentionally unreachable URL.
 *
 * `new PrismaClient()` throws when `DATABASE_URL` is unset, which would prevent
 * the process from starting at all. Substituting this placeholder lets the app
 * boot for local schema work, Swagger and the liveness probe; the first real
 * query then fails with `PrismaClientInitializationError`, which
 * `AllExceptionsFilter` maps to `503 DATABASE_UNAVAILABLE`.
 */
const UNCONFIGURED_DATABASE_URL = 'postgresql://unconfigured:unconfigured@127.0.0.1:1/unconfigured';

export interface DatabaseHealth {
  configured: boolean;
  connected: boolean;
  latencyMs: number | null;
  error?: string;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /** False when DATABASE_URL was not supplied. */
  readonly isConfigured: boolean;

  private connected = false;

  constructor(@Inject(APP_CONFIG) private readonly config: Configuration) {
    const url = config.database.url;
    super({
      datasourceUrl: url ?? UNCONFIGURED_DATABASE_URL,
      log: config.app.isProduction
        ? [
            { emit: 'event', level: 'warn' },
            { emit: 'event', level: 'error' },
          ]
        : [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'warn' },
            { emit: 'event', level: 'error' },
          ],
      errorFormat: config.app.isProduction ? 'minimal' : 'pretty',
    });
    this.isConfigured = Boolean(url);
  }

  async onModuleInit(): Promise<void> {
    this.registerLogForwarding();

    if (!this.isConfigured) {
      const message =
        'DATABASE_URL is not set. The API will start, but every database-backed route ' +
        'will return 503 DATABASE_UNAVAILABLE until it is configured.';
      if (this.config.database.required) {
        throw new Error(`${message} Set DATABASE_URL or REQUIRE_DATABASE=false.`);
      }
      this.logger.warn(message);
      return;
    }

    try {
      await this.$connect();
      this.connected = true;
      this.logger.log('Connected to PostgreSQL.');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (this.config.database.required) {
        // Fail fast rather than serving 503s from a "healthy looking" process.
        throw new Error(`Could not connect to the database: ${detail}`);
      }
      this.logger.warn(
        `Could not connect to the database at startup (${truncate(detail)}). ` +
          'Database-backed routes will return 503 until the connection succeeds.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
    } catch (error) {
      this.logger.warn(
        `Error while disconnecting from the database: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Readiness probe. Never throws — the caller decides what an unhealthy
   * database means for the response status.
   */
  async checkHealth(): Promise<DatabaseHealth> {
    if (!this.isConfigured) {
      return {
        configured: false,
        connected: false,
        latencyMs: null,
        error: 'DATABASE_URL is not configured.',
      };
    }

    const startedAt = process.hrtime.bigint();
    try {
      await this.$queryRaw`SELECT 1`;
      this.connected = true;
      return {
        configured: true,
        connected: true,
        latencyMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
      };
    } catch (error) {
      this.connected = false;
      return {
        configured: true,
        connected: false,
        latencyMs: null,
        error: truncate(error instanceof Error ? error.message : String(error)),
      };
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }

  /**
   * Forwards Prisma's internal log events into the Nest logger.
   *
   * Query text is logged at debug level in non-production only; parameters are
   * deliberately omitted because they can contain customer identifiers.
   */
  private registerLogForwarding(): void {
    const client = this as unknown as {
      $on: (event: string, callback: (payload: unknown) => void) => void;
    };

    if (!this.config.app.isProduction) {
      client.$on('query', (payload: unknown) => {
        const event = payload as Prisma.QueryEvent;
        this.logger.debug(`${event.query} (${event.duration}ms)`);
      });
    }
    client.$on('warn', (payload: unknown) => {
      this.logger.warn((payload as Prisma.LogEvent).message);
    });
    client.$on('error', (payload: unknown) => {
      this.logger.error((payload as Prisma.LogEvent).message);
    });
  }
}

function truncate(value: string, max = 300): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
