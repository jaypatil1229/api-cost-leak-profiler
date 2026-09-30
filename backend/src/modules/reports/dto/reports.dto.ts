import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsJSON,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ReportType } from '@prisma/client';

import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class ReportDateRangeDto {
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  from?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  to?: Date;
}

export class ReportQueryDto extends ReportDateRangeDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class CreateSavedReportDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsEnum(ReportType)
  type!: ReportType;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsObject()
  config!: Record<string, unknown>;
}

export class SavedReportQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ReportType)
  type?: ReportType;

  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class SavedReportResponseDto {
  id!: string;
  organizationId!: string;
  projectId!: string | null;
  name!: string;
  description!: string | null;
  type!: ReportType;
  config!: unknown;
  createdByUserId!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class OverviewReportDto {
  totalEvents!: number;
  totalCost!: string | null;
  totalInputTokens!: number;
  totalOutputTokens!: number;
  totalTokens!: number;
  topModels!: Array<{ model: string; eventCount: number; totalCost: string | null }>;
  topProviders!: Array<{ provider: string; eventCount: number; totalCost: string | null }>;
  topFeatures!: Array<{ featureId: string; eventCount: number; totalCost: string | null }>;
  activeFindingsCount!: number;
  activeAlertsCount!: number;
  currency!: string;
}

export class CostReportDto {
  totalCost!: string | null;
  costByModel!: Array<{ model: string; totalCost: string | null; percentage: number | null }>;
  costByProvider!: Array<{ provider: string; totalCost: string | null; percentage: number | null }>;
  costByFeature!: Array<{ featureId: string; totalCost: string | null; percentage: number | null }>;
  currency!: string;
}

export class UsageReportDto {
  totalEvents!: number;
  totalInputTokens!: number;
  totalOutputTokens!: number;
  totalTokens!: number;
  eventsByModel!: Array<{ model: string; eventCount: number; totalTokens: number }>;
  eventsByProvider!: Array<{ provider: string; eventCount: number; totalTokens: number }>;
  eventsByFeature!: Array<{ featureId: string; eventCount: number; totalTokens: number }>;
}

export class DetectionsReportDto {
  totalFindings!: number;
  openFindings!: number;
  resolvedFindings!: number;
  findingsBySeverity!: Array<{ severity: string; count: number }>;
  findingsByDetector!: Array<{ detectorType: string; count: number }>;
  totalAlerts!: number;
  activeAlerts!: number;
}
