import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

import {
  RequireOrgRole,
  RequireProjectRole,
} from '../../common/decorators/authorization.decorators';
import {
  CurrentOrganization,
  CurrentProject,
  CurrentUser,
  Req,
} from '../../common/decorators/context.decorators';
import {
  ApiCreatedEnvelope,
  ApiOkEnvelope,
  ApiStandardErrors,
} from '../../common/decorators/swagger.decorators';
import { OrganizationParamDto } from '../../common/dto/params.dto';
import type {
  AuthenticatedUser,
  OrganizationContext,
  ProjectContext,
  RequestContext,
} from '../../common/types/request-context';
import { auditActorFromRequest } from '../../common/types/request-context';
import { OrgRole } from '@prisma/client';

import { CreateProjectDto, type ProjectResponseDto, UpdateProjectDto } from './dto/project.dto';
import { ProjectsService } from './projects.service';

class ListProjectsQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  @IsBoolean()
  includeArchived?: boolean;
}

@ApiTags('Projects')
@Controller()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post('organizations/:organizationId/projects')
  @RequireOrgRole(OrgRole.MEMBER)
  @ApiOperation({
    summary: 'Create project',
    description: 'Creates a new project in the organization. Requires MEMBER role or higher.',
  })
  @ApiCreatedEnvelope()
  @ApiStandardErrors()
  async create(
    @Param() params: OrganizationParamDto,
    @Body() dto: CreateProjectDto,
    @CurrentOrganization() _orgContext: OrganizationContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestContext,
  ): Promise<ProjectResponseDto> {
    const project = await this.projectsService.create({
      organizationId: params.organizationId,
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
      environment: dto.environment,
      createdByUserId: user.id,
      actor: auditActorFromRequest(req),
    });

    return {
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      slug: project.slug,
      description: project.description,
      environment: project.environment,
      status: project.status,
      archivedAt: project.archivedAt?.toISOString() ?? null,
      createdByUserId: project.createdByUserId,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  @Get('organizations/:organizationId/projects')
  @RequireOrgRole(OrgRole.VIEWER)
  @ApiOperation({ summary: 'List projects in organization' })
  @ApiOkEnvelope()
  @ApiStandardErrors()
  async list(
    @Param() params: OrganizationParamDto,
    @Query() query: ListProjectsQueryDto,
    @CurrentOrganization() _orgContext: OrganizationContext,
  ): Promise<{ projects: ProjectResponseDto[] }> {
    const projects = await this.projectsService.listByOrganization(
      params.organizationId,
      query.includeArchived,
    );

    return {
      projects: projects.map((p) => ({
        id: p.id,
        organizationId: p.organizationId,
        name: p.name,
        slug: p.slug,
        description: p.description,
        environment: p.environment,
        status: p.status,
        archivedAt: p.archivedAt?.toISOString() ?? null,
        createdByUserId: p.createdByUserId,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
    };
  }

  @Get('projects/:projectId')
  @RequireProjectRole(OrgRole.VIEWER)
  @ApiOperation({ summary: 'Get project details' })
  @ApiOkEnvelope()
  @ApiStandardErrors({ notFound: true })
  async getOne(
    @Param('projectId') projectId: string,
    @CurrentProject() projectContext: ProjectContext,
  ): Promise<ProjectResponseDto> {
    const project = await this.projectsService.findById(projectId, projectContext.organizationId);

    return {
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      slug: project.slug,
      description: project.description,
      environment: project.environment,
      status: project.status,
      archivedAt: project.archivedAt?.toISOString() ?? null,
      createdByUserId: project.createdByUserId,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  @Patch('projects/:projectId')
  @RequireProjectRole(OrgRole.MEMBER)
  @ApiOperation({
    summary: 'Update project',
    description: 'Updates project details. Requires MEMBER role or higher.',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors({ notFound: true })
  async update(
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
    @CurrentProject() projectContext: ProjectContext,
    @Req() req: RequestContext,
  ): Promise<ProjectResponseDto> {
    const project = await this.projectsService.update({
      projectId,
      organizationId: projectContext.organizationId,
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
      environment: dto.environment,
      actor: auditActorFromRequest(req),
    });

    return {
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      slug: project.slug,
      description: project.description,
      environment: project.environment,
      status: project.status,
      archivedAt: project.archivedAt?.toISOString() ?? null,
      createdByUserId: project.createdByUserId,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  @Post('projects/:projectId/archive')
  @RequireProjectRole(OrgRole.ADMIN)
  @ApiOperation({
    summary: 'Archive project',
    description:
      'Archives a project. SDK ingestion is disabled for archived projects. Requires ADMIN role or higher.',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors({ notFound: true })
  async archive(
    @Param('projectId') projectId: string,
    @CurrentProject() projectContext: ProjectContext,
    @Req() req: RequestContext,
  ): Promise<{ success: true }> {
    await this.projectsService.archive({
      projectId,
      organizationId: projectContext.organizationId,
      actor: auditActorFromRequest(req),
    });

    return { success: true };
  }

  @Post('projects/:projectId/restore')
  @RequireProjectRole(OrgRole.ADMIN)
  @ApiOperation({
    summary: 'Restore archived project',
    description: 'Restores an archived project. Requires ADMIN role or higher.',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors({ notFound: true })
  async restore(
    @Param('projectId') projectId: string,
    @CurrentProject() projectContext: ProjectContext,
    @Req() req: RequestContext,
  ): Promise<{ success: true }> {
    await this.projectsService.restore({
      projectId,
      organizationId: projectContext.organizationId,
      actor: auditActorFromRequest(req),
    });

    return { success: true };
  }
}
