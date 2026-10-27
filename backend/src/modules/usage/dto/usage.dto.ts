import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CallStatus, CostStatus, Provider } from '@prisma/client';

import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class UsageQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Filter from this timestamp (inclusive).',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Filter to this timestamp (exclusive).',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ enum: Provider, enumName: 'Provider' })
  @IsOptional()
  @IsEnum(Provider)
  provider?: Provider;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  featureId?: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  customerUserId?: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  sessionId?: string;

  @ApiPropertyOptional({ enum: CallStatus, enumName: 'CallStatus' })
  @IsOptional()
  @IsEnum(CallStatus)
  status?: CallStatus;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sortBy?: string;
}

export class UsageRecordResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ example: 'evt_1234567890' })
  eventId!: string;

  @ApiPropertyOptional({ nullable: true })
  externalRequestId!: string | null;

  @ApiProperty({ enum: Provider, enumName: 'Provider' })
  provider!: Provider;

  @ApiProperty({ example: 'gpt-4' })
  model!: string;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty()
  inputTokens!: number;

  @ApiProperty()
  outputTokens!: number;

  @ApiProperty()
  totalTokens!: number;

  @ApiPropertyOptional({ nullable: true })
  cachedInputTokens!: number | null;

  @ApiPropertyOptional({ nullable: true })
  latencyMs!: number | null;

  @ApiProperty({ enum: CallStatus, enumName: 'CallStatus' })
  status!: CallStatus;

  @ApiPropertyOptional({ nullable: true })
  errorCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  featureId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  customerUserId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sessionId!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Estimated cost in USD. Null when pricing unavailable.',
  })
  estimatedInputCost!: string | null;

  @ApiPropertyOptional({ nullable: true })
  estimatedOutputCost!: string | null;

  @ApiPropertyOptional({ nullable: true })
  estimatedTotalCost!: string | null;

  @ApiProperty({ enum: CostStatus, enumName: 'CostStatus' })
  costStatus!: CostStatus;

  @ApiPropertyOptional({ nullable: true })
  pricingVersion!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class UsageSummaryDto {
  @ApiProperty()
  totalEvents!: number;

  @ApiProperty()
  totalInputTokens!: number;

  @ApiProperty()
  totalOutputTokens!: number;

  @ApiProperty()
  totalTokens!: number;

  @ApiPropertyOptional({ nullable: true })
  totalCost!: string | null;

  @ApiProperty({ example: 'USD' })
  currency!: string;
}

export class TimeseriesBucketDto {
  @ApiProperty({ format: 'date-time' })
  timestamp!: string;

  @ApiProperty()
  eventCount!: number;

  @ApiProperty()
  totalTokens!: number;

  @ApiPropertyOptional({ nullable: true })
  totalCost!: string | null;
}

export class AttributionBreakdownItemDto {
  @ApiProperty({ example: 'OPENAI' })
  dimension!: string;

  @ApiProperty()
  eventCount!: number;

  @ApiProperty()
  totalTokens!: number;

  @ApiPropertyOptional({ nullable: true })
  totalCost!: string | null;

  @ApiPropertyOptional({ nullable: true })
  percentage!: number | null;
}
