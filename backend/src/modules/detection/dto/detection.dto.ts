import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  AlertCategory,
  AlertStatus,
  DetectionRunStatus,
  DetectorType,
  FindingStatus,
  Severity,
} from '@prisma/client';

import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

// ── Detection Run DTOs ─────────────────────────────────────────────

export class DetectionRunQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DetectorType })
  @IsOptional()
  @IsEnum(DetectorType)
  detectorType?: DetectorType;

  @ApiPropertyOptional({ enum: DetectionRunStatus })
  @IsOptional()
  @IsEnum(DetectionRunStatus)
  status?: DetectionRunStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class DetectionRunResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ enum: DetectorType })
  detectorType!: DetectorType;

  @ApiProperty()
  detectorVersion!: string;

  @ApiProperty()
  engine!: string;

  @ApiProperty({ enum: DetectionRunStatus })
  status!: DetectionRunStatus;

  @ApiProperty({ format: 'date-time' })
  windowStart!: string;

  @ApiProperty({ format: 'date-time' })
  windowEnd!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  startedAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  completedAt!: string | null;

  @ApiProperty()
  recordsScanned!: number;

  @ApiProperty()
  findingsCreated!: number;

  @ApiPropertyOptional({ nullable: true })
  error!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  triggeredByUserId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

// ── Detection Finding DTOs ─────────────────────────────────────────

export class FindingQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DetectorType })
  @IsOptional()
  @IsEnum(DetectorType)
  detectorType?: DetectorType;

  @ApiPropertyOptional({ enum: FindingStatus })
  @IsOptional()
  @IsEnum(FindingStatus)
  status?: FindingStatus;

  @ApiPropertyOptional({ enum: Severity })
  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class UpdateFindingStatusDto {
  @ApiProperty({
    enum: [
      FindingStatus.ACKNOWLEDGED,
      FindingStatus.RESOLVED,
      FindingStatus.DISMISSED,
      FindingStatus.FALSE_POSITIVE,
    ],
  })
  @IsIn([
    FindingStatus.ACKNOWLEDGED,
    FindingStatus.RESOLVED,
    FindingStatus.DISMISSED,
    FindingStatus.FALSE_POSITIVE,
  ])
  status!: FindingStatus;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class FindingResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ enum: DetectorType })
  detectorType!: DetectorType;

  @ApiProperty()
  detectorVersion!: string;

  @ApiProperty({ enum: FindingStatus })
  status!: FindingStatus;

  @ApiProperty({ enum: Severity })
  severity!: Severity;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  explanation!: string;

  @ApiPropertyOptional({ nullable: true })
  evidence!: unknown | null;

  @ApiPropertyOptional({ nullable: true })
  estimatedRecoverableCost!: string | null;

  @ApiProperty()
  fingerprint!: string;

  @ApiProperty({ format: 'date-time' })
  windowStart!: string;

  @ApiProperty({ format: 'date-time' })
  windowEnd!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  detectionRunId!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  acknowledgedAt!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  acknowledgedByUserId!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  resolvedAt!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  resolvedByUserId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

// ── Alert DTOs ─────────────────────────────────────────────────────

export class AlertQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AlertCategory })
  @IsOptional()
  @IsEnum(AlertCategory)
  category?: AlertCategory;

  @ApiPropertyOptional({ enum: AlertStatus })
  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @ApiPropertyOptional({ enum: Severity })
  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class UpdateAlertStatusDto {
  @ApiProperty({ enum: [AlertStatus.ACKNOWLEDGED, AlertStatus.RESOLVED, AlertStatus.DISMISSED] })
  @IsIn([AlertStatus.ACKNOWLEDGED, AlertStatus.RESOLVED, AlertStatus.DISMISSED])
  status!: AlertStatus;
}

export class AlertResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  projectId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  findingId!: string | null;

  @ApiProperty({ enum: AlertCategory })
  category!: AlertCategory;

  @ApiProperty({ enum: Severity })
  severity!: Severity;

  @ApiProperty({ enum: AlertStatus })
  status!: AlertStatus;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional({ nullable: true })
  evidence!: unknown | null;

  @ApiPropertyOptional({ nullable: true })
  estimatedRecoverableCost!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  acknowledgedAt!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  acknowledgedByUserId!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  resolvedAt!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  resolvedByUserId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

// ── Trigger Run DTO ────────────────────────────────────────────────

export class TriggerDetectionRunDto {
  @ApiProperty({ enum: DetectorType })
  @IsEnum(DetectorType)
  detectorType!: DetectorType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  projectId!: string;

  @ApiProperty({ format: 'date-time' })
  @Type(() => Date)
  @IsDate({ message: 'windowStart must be a valid ISO-8601 date-time' })
  windowStart!: Date;

  @ApiProperty({ format: 'date-time' })
  @Type(() => Date)
  @IsDate({ message: 'windowEnd must be a valid ISO-8601 date-time' })
  windowEnd!: Date;
}
