import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentOrganization } from '../../common/decorators/context.decorators';
import {
  RequireOrgMembership,
} from '../../common/decorators/authorization.decorators';
import {
  ApiOkEnvelope,
  ApiPaginatedEnvelope,
  ApiStandardErrors,
} from '../../common/decorators/swagger.decorators';
import { DateRangeQueryDto, GranularityQueryDto } from '../../common/dto/date-range.dto';
import type { OrganizationContext } from '../../common/types/request-context';

import {
  type AttributionBreakdownItemDto,
  type TimeseriesBucketDto,
  UsageRecordResponseDto,
  UsageQueryDto,
  type UsageSummaryDto,
} from './dto/usage.dto';
import { UsageService } from './usage.service';

@ApiTags('Usage')
@Controller('organizations/:organizationId/usage')
@RequireOrgMembership()
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get()
  @ApiOperation({
    summary: 'List usage records',
    description:
      'Returns paginated usage records scoped to the organization. Supports filtering by project, provider, model, date range, and attribution dimensions.',
  })
  @ApiPaginatedEnvelope(UsageRecordResponseDto as any)
  @ApiStandardErrors({ notFound: true })
  async list(
    @Query() query: UsageQueryDto,
    @CurrentOrganization() orgContext: OrganizationContext,
  ) {
    return this.usageService.listRecords(orgContext.organizationId, query);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Get usage summary',
    description:
      'Returns aggregate totals (event count, tokens, cost) for the given time range.',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors()
  async summary(
    @Query() query: DateRangeQueryDto,
    @CurrentOrganization() orgContext: OrganizationContext,
  ): Promise<UsageSummaryDto> {
    return this.usageService.getSummary(orgContext.organizationId, {
      from: query.from,
      to: query.to,
      projectId: (query as any).projectId,
    });
  }

  @Get('timeseries')
  @ApiOperation({
    summary: 'Get usage timeseries',
    description:
      'Returns time-bucketed usage data. Granularity can be hour, day, week, or month; auto-selected if omitted.',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors()
  async timeseries(
    @Query() query: GranularityQueryDto,
    @CurrentOrganization() orgContext: OrganizationContext,
  ): Promise<{ granularity: string; buckets: TimeseriesBucketDto[] }> {
    return this.usageService.getTimeseries(orgContext.organizationId, {
      from: query.from,
      to: query.to,
      granularity: query.granularity as any,
      projectId: (query as any).projectId,
    });
  }

  @Get('breakdown/:dimension')
  @ApiOperation({
    summary: 'Get usage breakdown by dimension',
    description:
      'Groups usage by a dimension (provider, model, featureId, customerUserId, sessionId) and returns totals and percentages.',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors({ notFound: true })
  async breakdown(
    @Param('dimension') dimension: string,
    @Query() query: DateRangeQueryDto,
    @CurrentOrganization() orgContext: OrganizationContext,
  ): Promise<AttributionBreakdownItemDto[]> {
    return this.usageService.getBreakdown(orgContext.organizationId, dimension, {
      from: query.from,
      to: query.to,
      projectId: (query as any).projectId,
    });
  }

  @Get(':recordId')
  @ApiOperation({
    summary: 'Get a single usage record',
    description: 'Returns a single usage record by its ID, scoped to the organization.',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors({ notFound: true })
  async getOne(
    @Param('recordId') recordId: string,
    @CurrentOrganization() orgContext: OrganizationContext,
  ): Promise<UsageRecordResponseDto> {
    return this.usageService.getRecord(orgContext.organizationId, recordId);
  }
}
