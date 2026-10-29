import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Matches,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CallStatus, Provider } from '@prisma/client';

export class IngestUsageEventDto {
  @ApiProperty({
    example: 'evt_1234567890',
    maxLength: 128,
    description: 'Client-supplied unique event ID for idempotency.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  eventId!: string;

  @ApiProperty({ enum: Provider, enumName: 'Provider' })
  @IsEnum(Provider)
  provider!: Provider;

  @ApiProperty({ example: 'gpt-4', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  model!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'When the provider call occurred (client clock). Validated for sanity.',
  })
  @IsString()
  @IsNotEmpty()
  occurredAt!: string;

  @ApiProperty({ minimum: 0, example: 1523 })
  @IsInt()
  @Min(0)
  inputTokens!: number;

  @ApiProperty({ minimum: 0, example: 342 })
  @IsInt()
  @Min(0)
  outputTokens!: number;

  @ApiProperty({ minimum: 0, example: 1865 })
  @IsInt()
  @Min(0)
  totalTokens!: number;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  cachedInputTokens?: number | null;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  latencyMs?: number | null;

  @ApiPropertyOptional({ enum: CallStatus, enumName: 'CallStatus' })
  @IsOptional()
  @IsEnum(CallStatus)
  status?: CallStatus;

  @ApiPropertyOptional({ maxLength: 64, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  errorCode?: string | null;

  @ApiPropertyOptional({ maxLength: 128, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalRequestId?: string | null;

  @ApiPropertyOptional({
    maxLength: 128,
    nullable: true,
    description: 'Caller-supplied ID shared by attempts of the same logical operation.',
  })
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'operationId must not be blank.' })
  @MaxLength(128)
  operationId?: string | null;

  @ApiPropertyOptional({ maxLength: 128, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  featureId?: string | null;

  @ApiPropertyOptional({ maxLength: 128, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  customerUserId?: string | null;

  @ApiPropertyOptional({ maxLength: 128, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  sessionId?: string | null;

  @ApiPropertyOptional({ maxLength: 128, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  promptHash?: string | null;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  promptCharCount?: number | null;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  completionCharCount?: number | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  metadata?: Record<string, unknown> | null;
}

export class IngestBatchDto {
  @ApiPropertyOptional({ maxLength: 128, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientBatchId?: string | null;

  @ApiProperty({ type: [IngestUsageEventDto], minItems: 1 })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestUsageEventDto)
  events!: IngestUsageEventDto[];
}

export class IngestEventOutcomeDto {
  @ApiProperty({ example: 'evt_1234567890' })
  eventId!: string;

  @ApiProperty({
    enum: ['accepted', 'duplicate', 'rejected'],
    example: 'accepted',
  })
  status!: 'accepted' | 'duplicate' | 'rejected';

  @ApiPropertyOptional({ example: 'Event timestamp is too far in the future.' })
  reason?: string;
}

export class IngestUsageResponseDto {
  @ApiProperty({ example: 'accepted', enum: ['accepted', 'duplicate', 'rejected'] })
  status!: 'accepted' | 'duplicate' | 'rejected';

  @ApiPropertyOptional()
  reason?: string;

  @ApiProperty({ format: 'uuid' })
  usageRecordId!: string | null;
}

export class IngestBatchResponseDto {
  @ApiProperty()
  batchId!: string;

  @ApiProperty()
  eventCount!: number;

  @ApiProperty()
  acceptedCount!: number;

  @ApiProperty()
  duplicateCount!: number;

  @ApiProperty()
  rejectedCount!: number;

  @ApiProperty({ type: [IngestEventOutcomeDto] })
  outcomes!: IngestEventOutcomeDto[];

  @ApiProperty({ type: [String] })
  warnings!: string[];
}
