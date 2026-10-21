import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsUUID } from 'class-validator';

import { TimeGranularity, type TimeGranularityValue } from '../utils/time-range.util';

/**
 * Absolute time window shared by analytics, cost and report endpoints.
 *
 * Semantics: both bounds are instants in UTC; `from` is inclusive and `to` is
 * exclusive. When omitted, endpoints default to a documented trailing window.
 */
export class DateRangeQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Optional project scope. Membership is still checked by the backend.' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Inclusive lower bound (ISO-8601, UTC). Defaults to a trailing window.',
    example: '2026-01-01T00:00:00.000Z',
  })
  @Type(() => Date)
  @IsOptional()
  @IsDate({ message: 'from must be a valid ISO-8601 date-time' })
  from?: Date;

  @ApiPropertyOptional({
    description: 'Exclusive upper bound (ISO-8601, UTC). Defaults to now.',
    example: '2026-02-01T00:00:00.000Z',
  })
  @Type(() => Date)
  @IsOptional()
  @IsDate({ message: 'to must be a valid ISO-8601 date-time' })
  to?: Date;
}

export class GranularityQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({
    enum: Object.values(TimeGranularity),
    description:
      'Bucket size. Defaults to a granularity chosen from the window length. ' +
      'Combinations that would produce more than 1500 buckets are rejected.',
  })
  @IsOptional()
  @IsIn(Object.values(TimeGranularity))
  granularity?: TimeGranularityValue;
}
