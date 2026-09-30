import { Controller, Get, HttpCode, HttpStatus, Inject, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { API_VERSION, APP_NAME, APP_VERSION } from '../../common/constants/app.constants';
import { Public } from '../../common/decorators/public.decorator';
import { ApiOkEnvelope } from '../../common/decorators/swagger.decorators';
import { APP_CONFIG } from '../../config/config.module';
import type { Configuration } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';

import {
  type DependencyHealthDto,
  LivenessResponseDto,
  ReadinessResponseDto,
} from './dto/health-response.dto';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: Configuration,
  ) {}

  /**
   * Liveness: answers "is this process running?" and deliberately touches no
   * dependency. An orchestrator must not restart the container because
   * PostgreSQL is briefly unreachable.
   */
  @Public()
  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Always succeeds while the process is running. Performs no database access, so it is safe to use as a Kubernetes livenessProbe.',
  })
  @ApiOkEnvelope(LivenessResponseDto)
  live(): LivenessResponseDto {
    return {
      status: 'ok',
      apiVersion: API_VERSION,
      service: APP_NAME,
      version: APP_VERSION,
      uptimeSeconds: Number(process.uptime().toFixed(3)),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness: reports dependency state and returns 503 when the database is
   * unusable, so a load balancer stops sending traffic to this instance.
   *
   * The analytics service is optional by design and never makes the instance
   * unready.
   */
  @Public()
  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Checks the database with `SELECT 1`. Returns 200 when ready and 503 when the database is not configured or not reachable. The optional Python analytics service is reported but never affects readiness.',
  })
  @ApiOkEnvelope(ReadinessResponseDto, {
    description: 'Ready. A 503 with the same body shape is returned when not ready.',
  })
  async ready(@Res({ passthrough: true }) response: Response): Promise<ReadinessResponseDto> {
    const database = await this.prisma.checkHealth();

    const databaseHealth: DependencyHealthDto = {
      status: !database.configured ? 'not_configured' : database.connected ? 'up' : 'down',
      latencyMs: database.latencyMs,
      // Connection errors can name hosts and ports: only expose them off-production.
      ...(database.error && !this.config.app.isProduction ? { detail: database.error } : {}),
    };

    const isReady = database.configured && database.connected;
    if (!isReady) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: isReady ? 'ready' : 'not_ready',
      apiVersion: API_VERSION,
      database: databaseHealth,
      analytics: {
        // Not probed: reachability of an optional dependency is checked lazily
        // by AnalyticsClientService when a route actually needs it.
        status: this.config.analytics.enabled ? 'up' : 'not_configured',
        latencyMs: null,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
