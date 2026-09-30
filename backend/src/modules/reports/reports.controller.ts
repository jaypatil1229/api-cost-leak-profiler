import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentOrganization, CurrentUser } from '../../common/decorators/context.decorators';
import { RequireOrgMembership } from '../../common/decorators/authorization.decorators';
import type { AuthenticatedUser, OrganizationContext } from '../../common/types/request-context';

import { ReportsService } from './reports.service';
import {
  CreateSavedReportDto,
  ReportQueryDto,
  SavedReportQueryDto,
} from './dto/reports.dto';

@Controller('organizations/:organizationId/reports')
@RequireOrgMembership()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  getOverviewReport(
    @CurrentOrganization() org: OrganizationContext,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getOverviewReport(org.organizationId, query);
  }

  @Get('cost')
  getCostReport(
    @CurrentOrganization() org: OrganizationContext,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getCostReport(org.organizationId, query);
  }

  @Get('usage')
  getUsageReport(
    @CurrentOrganization() org: OrganizationContext,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getUsageReport(org.organizationId, query);
  }

  @Get('detections')
  getDetectionsReport(
    @CurrentOrganization() org: OrganizationContext,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getDetectionsReport(org.organizationId, query);
  }

  @Post('saved')
  createSavedReport(
    @CurrentOrganization() org: OrganizationContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSavedReportDto,
  ) {
    return this.reportsService.createSavedReport(org.organizationId, dto, user.userId);
  }

  @Get('saved')
  listSavedReports(
    @CurrentOrganization() org: OrganizationContext,
    @Query() query: SavedReportQueryDto,
  ) {
    return this.reportsService.listSavedReports(org.organizationId, query);
  }

  @Get('saved/:reportId')
  getSavedReport(
    @CurrentOrganization() org: OrganizationContext,
    @Param('reportId', new ParseUUIDPipe()) reportId: string,
  ) {
    return this.reportsService.getSavedReport(org.organizationId, reportId);
  }

  @Delete('saved/:reportId')
  deleteSavedReport(
    @CurrentOrganization() org: OrganizationContext,
    @Param('reportId', new ParseUUIDPipe()) reportId: string,
  ) {
    return this.reportsService.deleteSavedReport(org.organizationId, reportId);
  }
}
