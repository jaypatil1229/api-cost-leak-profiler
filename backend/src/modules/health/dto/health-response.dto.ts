import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LivenessResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: 'v1' })
  apiVersion!: string;

  @ApiProperty({ example: 'aclp-backend' })
  service!: string;

  @ApiProperty({ example: '0.1.0' })
  version!: string;

  @ApiProperty({ example: 12.34, description: 'Process uptime in seconds.' })
  uptimeSeconds!: number;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  timestamp!: string;
}

export class DependencyHealthDto {
  @ApiProperty({ example: 'up', enum: ['up', 'down', 'not_configured'] })
  status!: 'up' | 'down' | 'not_configured';

  @ApiPropertyOptional({ example: 1.42, nullable: true, description: 'Round-trip latency in ms.' })
  latencyMs?: number | null;

  @ApiPropertyOptional({
    description:
      'Failure detail. Only populated outside production, so infrastructure details are not exposed publicly.',
  })
  detail?: string;
}

export class ReadinessResponseDto {
  @ApiProperty({ example: 'ready', enum: ['ready', 'not_ready'] })
  status!: 'ready' | 'not_ready';

  @ApiProperty({ example: 'v1' })
  apiVersion!: string;

  @ApiProperty({ type: DependencyHealthDto })
  database!: DependencyHealthDto;

  @ApiProperty({
    type: DependencyHealthDto,
    description:
      'Optional Python analytics service. Reported as not_configured when ANALYTICS_SERVICE_URL is unset; the backend is fully usable without it.',
  })
  analytics!: DependencyHealthDto;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  timestamp!: string;
}
