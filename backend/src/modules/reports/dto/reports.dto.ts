import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
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

export class OverviewModelItemDto {
  model!: string;
  eventCount!: number;
  totalCost!: string | null;
}

export class OverviewProviderItemDto {
  provider!: string;
  eventCount!: number;
  totalCost!: string | null;
}

export class OverviewFeatureItemDto {
  featureId!: string;
  eventCount!: number;
  totalCost!: string | null;
}

export class CostBreakdownItemDto {
  model!: string;
  totalCost!: string | null;
  percentage!: number | null;
}

export class ProviderCostBreakdownItemDto {
  provider!: string;
  totalCost!: string | null;
  percentage!: number | null;
}

export class FeatureCostBreakdownItemDto {
  featureId!: string;
  totalCost!: string | null;
  percentage!: number | null;
}

export class UsageModelItemDto {
  model!: string;
  eventCount!: number;
  totalTokens!: number;
}

export class UsageProviderItemDto {
  provider!: string;
  eventCount!: number;
  totalTokens!: number;
}

export class UsageFeatureItemDto {
  featureId!: string;
  eventCount!: number;
  totalTokens!: number;
}

export class FindingSeverityItemDto {
  severity!: string;
  count!: number;
}

export class FindingDetectorItemDto {
  detectorType!: string;
  count!: number;
}

export class OverviewReportDto {
  totalEvents!: number;
  totalCost!: string | null;
  totalInputTokens!: number;
  totalOutputTokens!: number;
  totalTokens!: number;
  topModels!: OverviewModelItemDto[];
  topProviders!: OverviewProviderItemDto[];
  topFeatures!: OverviewFeatureItemDto[];
  activeFindingsCount!: number;
  activeAlertsCount!: number;
  currency!: string;
}

export class CostReportDto {
  totalCost!: string | null;
  costByModel!: CostBreakdownItemDto[];
  costByProvider!: ProviderCostBreakdownItemDto[];
  costByFeature!: FeatureCostBreakdownItemDto[];
  currency!: string;
}

export class UsageReportDto {
  totalEvents!: number;
  totalInputTokens!: number;
  totalOutputTokens!: number;
  totalTokens!: number;
  eventsByModel!: UsageModelItemDto[];
  eventsByProvider!: UsageProviderItemDto[];
  eventsByFeature!: UsageFeatureItemDto[];
}

export class DetectionsReportDto {
  totalFindings!: number;
  openFindings!: number;
  resolvedFindings!: number;
  findingsBySeverity!: FindingSeverityItemDto[];
  findingsByDetector!: FindingDetectorItemDto[];
  totalAlerts!: number;
  activeAlerts!: number;
}
