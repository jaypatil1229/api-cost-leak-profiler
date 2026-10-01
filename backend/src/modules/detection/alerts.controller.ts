import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';

import { CurrentOrganization, CurrentUser } from '../../common/decorators/context.decorators';
import { RequireOrgMembership } from '../../common/decorators/authorization.decorators';
import type { AuthenticatedUser, OrganizationContext } from '../../common/types/request-context';

import { AlertsService } from './alerts.service';
import { AlertQueryDto, UpdateAlertStatusDto } from './dto/detection.dto';

@Controller('organizations/:organizationId/alerts')
@RequireOrgMembership()
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  listAlerts(
    @CurrentOrganization() org: OrganizationContext,
    @Query() query: AlertQueryDto,
  ) {
    return this.alertsService.listAlerts(org.organizationId, query);
  }

  @Get(':alertId')
  getAlert(
    @CurrentOrganization() org: OrganizationContext,
    @Param('alertId', new ParseUUIDPipe()) alertId: string,
  ) {
    return this.alertsService.getAlert(org.organizationId, alertId);
  }

  @Patch(':alertId/status')
  updateAlertStatus(
    @CurrentOrganization() org: OrganizationContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('alertId', new ParseUUIDPipe()) alertId: string,
    @Body() dto: UpdateAlertStatusDto,
  ) {
    return this.alertsService.updateAlertStatus(
      org.organizationId,
      alertId,
      dto,
      user.id,
    );
  }
}
