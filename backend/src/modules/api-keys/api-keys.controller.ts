import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequireProjectRole } from '../../common/decorators/authorization.decorators';
import { CurrentProject, CurrentUser, Req } from '../../common/decorators/context.decorators';
import {
  ApiCreatedEnvelope,
  ApiOkEnvelope,
  ApiStandardErrors,
} from '../../common/decorators/swagger.decorators';
import type {
  AuthenticatedUser,
  ProjectContext,
  RequestContext,
} from '../../common/types/request-context';
import { auditActorFromRequest } from '../../common/types/request-context';
import { OrgRole } from '@prisma/client';
import { maskedApiKey } from '../../common/utils/api-key.util';
import {
  type ApiKeyCreatedResponseDto,
  type ApiKeyResponseDto,
  CreateApiKeyDto,
} from './dto/api-key.dto';
import { ApiKeysService } from './api-keys.service';

@ApiTags('API Keys')
@Controller('projects/:projectId/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @RequireProjectRole(OrgRole.MEMBER)
  @ApiOperation({
    summary: 'Create API key',
    description:
      'Creates a new SDK API key for the project. The full key is returned once and never stored. Requires MEMBER role or higher.',
  })
  @ApiCreatedEnvelope()
  @ApiStandardErrors()
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateApiKeyDto,
    @CurrentProject() projectContext: ProjectContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestContext,
  ): Promise<ApiKeyCreatedResponseDto> {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;

    const apiKey = await this.apiKeysService.create({
      organizationId: projectContext.organizationId,
      projectId,
      name: dto.name,
      scopes: dto.scopes,
      expiresAt,
      createdByUserId: user.id,
      actor: auditActorFromRequest(req),
    });

    return {
      id: apiKey.id,
      projectId: apiKey.projectId,
      name: apiKey.name,
      keyPrefix: maskedApiKey(apiKey.keyPrefix),
      scopes: apiKey.scopes,
      lastUsedAt: null,
      expiresAt: apiKey.expiresAt?.toISOString() ?? null,
      revokedAt: null,
      createdAt: apiKey.createdAt.toISOString(),
      rawKey: apiKey.rawKey,
    };
  }

  @Get()
  @RequireProjectRole(OrgRole.VIEWER)
  @ApiOperation({
    summary: 'List API keys',
    description: 'Lists all API keys for the project. Never returns the full key — only metadata.',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors()
  async list(
    @Param('projectId') projectId: string,
    @CurrentProject() _projectContext: ProjectContext,
  ): Promise<{ apiKeys: ApiKeyResponseDto[] }> {
    const keys = await this.apiKeysService.list(projectId);

    return {
      apiKeys: keys.map((key) => ({
        id: key.id,
        projectId: key.projectId,
        name: key.name,
        keyPrefix: maskedApiKey(key.keyPrefix),
        scopes: key.scopes,
        lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
        expiresAt: key.expiresAt?.toISOString() ?? null,
        revokedAt: key.revokedAt?.toISOString() ?? null,
        createdAt: key.createdAt.toISOString(),
      })),
    };
  }

  @Post(':apiKeyId/revoke')
  @RequireProjectRole(OrgRole.MEMBER)
  @ApiOperation({
    summary: 'Revoke API key',
    description:
      'Revokes an API key. SDK requests with this key will be rejected. Requires MEMBER role or higher.',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors({ notFound: true })
  async revoke(
    @Param('apiKeyId') apiKeyId: string,
    @CurrentProject() projectContext: ProjectContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestContext,
  ): Promise<{ success: true }> {
    await this.apiKeysService.revoke({
      apiKeyId,
      organizationId: projectContext.organizationId,
      revokedByUserId: user.id,
      actor: auditActorFromRequest(req),
    });

    return { success: true };
  }

  @Post(':apiKeyId/rotate')
  @RequireProjectRole(OrgRole.MEMBER)
  @ApiOperation({
    summary: 'Rotate API key',
    description:
      'Rotates an API key: creates a new key with the same name and scopes, revokes the old one, and returns the new full key once. Requires MEMBER role or higher.',
  })
  @ApiCreatedEnvelope()
  @ApiStandardErrors({ notFound: true })
  async rotate(
    @Param('apiKeyId') apiKeyId: string,
    @CurrentProject() projectContext: ProjectContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestContext,
  ): Promise<ApiKeyCreatedResponseDto> {
    const newKey = await this.apiKeysService.rotate({
      apiKeyId,
      organizationId: projectContext.organizationId,
      projectId: projectContext.projectId,
      createdByUserId: user.id,
      actor: auditActorFromRequest(req),
    });

    return {
      id: newKey.id,
      projectId: newKey.projectId,
      name: newKey.name,
      keyPrefix: maskedApiKey(newKey.keyPrefix),
      scopes: newKey.scopes,
      lastUsedAt: null,
      expiresAt: newKey.expiresAt?.toISOString() ?? null,
      revokedAt: null,
      createdAt: newKey.createdAt.toISOString(),
      rawKey: newKey.rawKey,
    };
  }
}
