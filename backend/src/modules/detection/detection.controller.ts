import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentOrganization, CurrentUser } from '../../common/decorators/context.decorators';
import { RequireOrgMembership } from '../../common/decorators/authorization.decorators';
import type { AuthenticatedUser, OrganizationContext } from '../../common/types/request-context';

import { DetectionService } from './detection.service';
import {
  DetectionRunQueryDto,
  FindingQueryDto,
  TriggerDetectionRunDto,
  UpdateFindingStatusDto,
} from './dto/detection.dto';

@Controller('organizations/:organizationId/detection')
@RequireOrgMembership()
export class DetectionController {
  constructor(private readonly detectionService: DetectionService) {}

  @Get('detectors')
  listDetectors() {
    return this.detectionService.listRegisteredDetectors();
  }

  @Post('runs')
  @HttpCode(HttpStatus.CREATED)
  triggerRun(
    @CurrentOrganization() org: OrganizationContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TriggerDetectionRunDto,
  ) {
    return this.detectionService.triggerRun(org.organizationId, dto, user.userId);
  }

  @Get('runs')
  listRuns(
    @CurrentOrganization() org: OrganizationContext,
    @Query() query: DetectionRunQueryDto,
  ) {
    return this.detectionService.listRuns(org.organizationId, query);
  }

  @Get('runs/:runId')
  getRun(
    @CurrentOrganization() org: OrganizationContext,
    @Param('runId', new ParseUUIDPipe()) runId: string,
  ) {
    return this.detectionService.getRun(org.organizationId, runId);
  }

  @Get('findings')
  listFindings(
    @CurrentOrganization() org: OrganizationContext,
    @Query() query: FindingQueryDto,
  ) {
    return this.detectionService.listFindings(org.organizationId, query);
  }

  @Get('findings/:findingId')
  getFinding(
    @CurrentOrganization() org: OrganizationContext,
    @Param('findingId', new ParseUUIDPipe()) findingId: string,
  ) {
    return this.detectionService.getFinding(org.organizationId, findingId);
  }

  @Patch('findings/:findingId/status')
  updateFindingStatus(
    @CurrentOrganization() org: OrganizationContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('findingId', new ParseUUIDPipe()) findingId: string,
    @Body() dto: UpdateFindingStatusDto,
  ) {
    return this.detectionService.updateFindingStatus(
      org.organizationId,
      findingId,
      dto,
      user.userId,
    );
  }
}
