import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Req, CurrentOrganization } from '../../common/decorators/context.decorators';
import {
  RequireOrgMembership,
  RequireOrgRole,
} from '../../common/decorators/authorization.decorators';
import {
  ApiCreatedEnvelope,
  ApiOkEnvelope,
  ApiStandardErrors,
} from '../../common/decorators/swagger.decorators';
import { UuidParamDto } from '../../common/dto/params.dto';
import type { AuthenticatedUser, OrganizationContext, RequestContext } from '../../common/types/request-context';
import { auditActorFromRequest } from '../../common/types/request-context';
import { OrgRole } from '@prisma/client';

import {
  CreateOrganizationDto,
  type OrganizationResponseDto,
  TransferOwnershipDto,
  UpdateOrganizationDto,
} from './dto/organization.dto';
import type { MemberResponseDto } from './dto/membership.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create organization',
    description: 'Creates a new organization. The authenticated user becomes the owner.',
  })
  @ApiCreatedEnvelope()
  @ApiStandardErrors()
  async create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestContext,
  ): Promise<OrganizationResponseDto> {
    const org = await this.organizationsService.create({
      name: dto.name,
      slug: dto.slug,
      userId: user.id,
      actor: auditActorFromRequest(req),
    });

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      status: org.status,
      ownerUserId: org.ownerUserId,
      role: org.memberships[0].role,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
    };
  }

  @Get(':organizationId')
  @RequireOrgMembership()
  @ApiOperation({ summary: 'Get organization details' })
  @ApiOkEnvelope()
  @ApiStandardErrors({ notFound: true })
  async getOne(
    @Param() params: OrganizationParamDto,
    @CurrentOrganization() orgContext: OrganizationContext,
  ): Promise<OrganizationResponseDto> {
    const org = await this.organizationsService.findById(params.organizationId);

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      status: org.status,
      ownerUserId: org.ownerUserId,
      role: orgContext.role,
      memberCount: org._count.memberships,
      projectCount: org._count.projects,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
    };
  }

  @Patch(':organizationId')
  @RequireOrgRole(OrgRole.ADMIN)
  @ApiOperation({ summary: 'Update organization', description: 'Requires ADMIN role or higher.' })
  @ApiOkEnvelope()
  @ApiStandardErrors({ notFound: true })
  async update(
    @Param() params: OrganizationParamDto,
    @Body() dto: UpdateOrganizationDto,
    @CurrentOrganization() orgContext: OrganizationContext,
    @Req() req: RequestContext,
  ): Promise<OrganizationResponseDto> {
    const org = await this.organizationsService.update({
      organizationId: params.organizationId,
      name: dto.name,
      slug: dto.slug,
      actor: auditActorFromRequest(req),
    });

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      status: org.status,
      ownerUserId: org.ownerUserId,
      role: orgContext.role,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
    };
  }

  @Post(':organizationId/transfer-ownership')
  @RequireOrgRole(OrgRole.OWNER)
  @ApiOperation({
    summary: 'Transfer ownership',
    description:
      'Transfers ownership to another active member. The current owner is demoted to ADMIN. Requires OWNER role.',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors({ notFound: true })
  async transferOwnership(
    @Param() params: UuidParamDto,
    @Body() dto: TransferOwnershipDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestContext,
  ): Promise<{ success: true }> {
    await this.organizationsService.transferOwnership({
      organizationId: params.organizationId,
      currentOwnerId: user.id,
      newOwnerId: dto.userId,
      actor: auditActorFromRequest(req),
    });

    return { success: true };
  }

  @Get(':organizationId/members')
  @RequireOrgMembership()
  @ApiOperation({ summary: 'List organization members' })
  @ApiOkEnvelope()
  @ApiStandardErrors()
  async listMembers(@Param() params: UuidParamDto): Promise<{ members: MemberResponseDto[] }> {
    const members = await this.organizationsService.listMembers(params.organizationId);

    return {
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: m.email,
        name: m.name,
        role: m.role,
        status: m.status,
        isOwner: m.isOwner,
        joinedAt: m.joinedAt.toISOString(),
      })),
    };
  }

  @Delete(':organizationId/members/:membershipId')
  @RequireOrgRole(OrgRole.ADMIN)
  @ApiOperation({
    summary: 'Remove member',
    description: 'Removes a member from the organization. Cannot remove the owner. Requires ADMIN role or higher.',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors({ notFound: true })
  async removeMember(
    @Param('organizationId') organizationId: string,
    @Param('membershipId') membershipId: string,
    @Req() req: RequestContext,
  ): Promise<{ success: true }> {
    await this.organizationsService.removeMember({
      organizationId,
      membershipId,
      actor: auditActorFromRequest(req),
    });

    return { success: true };
  }
}
