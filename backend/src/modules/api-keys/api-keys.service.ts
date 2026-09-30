import { Inject, Injectable } from '@nestjs/common';
import { ApiKeyScope, Prisma } from '@prisma/client';

import { AuditAction } from '../../common/constants/audit-actions';
import { ErrorCode } from '../../common/constants/error-codes';
import { NotFoundAppException } from '../../common/exceptions/app.exception';
import { AuditService } from '../../common/services/audit.service';
import type { AuditActor } from '../../common/types/request-context';
import { generateApiKey, maskedApiKey } from '../../common/utils/api-key.util';
import { APP_CONFIG } from '../../config/config.module';
import type { Configuration } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: Configuration,
  ) {}

  async create(input: {
    organizationId: string;
    projectId: string;
    name: string;
    scopes: ApiKeyScope[];
    expiresAt?: Date;
    createdByUserId: string;
    actor: AuditActor;
  }) {
    const generated = generateApiKey(this.config.auth.apiKeyHmacSecret);

    const apiKey = await this.prisma.$transaction(async (tx) => {
      const created = await tx.apiKey.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          name: input.name,
          keyPrefix: generated.keyPrefix,
          keyHash: generated.keyHash,
          scopes: input.scopes,
          expiresAt: input.expiresAt,
          createdByUserId: input.createdByUserId,
        },
      });

      await this.audit.record(
        {
          action: AuditAction.API_KEY_CREATED,
          resourceType: 'ApiKey',
          resourceId: created.id,
          organizationId: input.organizationId,
          actor: input.actor,
          metadata: {
            projectId: input.projectId,
            keyPrefix: generated.keyPrefix,
            scopes: input.scopes,
          },
        },
        tx,
      );

      return { ...created, rawKey: generated.plaintext };
    });

    return apiKey;
  }

  async list(projectId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        projectId: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });

    return keys;
  }

  async revoke(input: {
    apiKeyId: string;
    organizationId: string;
    revokedByUserId: string;
    actor: AuditActor;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const key = await tx.apiKey.findUnique({
        where: { id: input.apiKeyId },
        select: { id: true, organizationId: true, revokedAt: true },
      });

      if (!key || key.organizationId !== input.organizationId) {
        throw new NotFoundAppException('API Key', input.apiKeyId);
      }

      if (!key.revokedAt) {
        await tx.apiKey.update({
          where: { id: input.apiKeyId },
          data: {
            revokedAt: new Date(),
            revokedByUserId: input.revokedByUserId,
          },
        });

        await this.audit.record(
          {
            action: AuditAction.API_KEY_REVOKED,
            resourceType: 'ApiKey',
            resourceId: input.apiKeyId,
            organizationId: input.organizationId,
            actor: input.actor,
          },
          tx,
        );
      }
    });
  }

  async rotate(input: {
    apiKeyId: string;
    organizationId: string;
    projectId: string;
    createdByUserId: string;
    actor: AuditActor;
  }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const oldKey = await tx.apiKey.findUnique({
        where: { id: input.apiKeyId },
        select: {
          id: true,
          organizationId: true,
          projectId: true,
          name: true,
          scopes: true,
          expiresAt: true,
          revokedAt: true,
        },
      });

      if (!oldKey || oldKey.organizationId !== input.organizationId) {
        throw new NotFoundAppException('API Key', input.apiKeyId);
      }

      const generated = generateApiKey(this.config.auth.apiKeyHmacSecret);

      const newKey = await tx.apiKey.create({
        data: {
          organizationId: oldKey.organizationId,
          projectId: oldKey.projectId,
          name: oldKey.name,
          keyPrefix: generated.keyPrefix,
          keyHash: generated.keyHash,
          scopes: oldKey.scopes,
          expiresAt: oldKey.expiresAt,
          rotatedFromKeyId: oldKey.id,
          createdByUserId: input.createdByUserId,
        },
      });

      await tx.apiKey.update({
        where: { id: input.apiKeyId },
        data: {
          revokedAt: new Date(),
          revokedByUserId: input.createdByUserId,
        },
      });

      await this.audit.record(
        {
          action: AuditAction.API_KEY_ROTATED,
          resourceType: 'ApiKey',
          resourceId: newKey.id,
          organizationId: input.organizationId,
          actor: input.actor,
          metadata: {
            oldKeyId: oldKey.id,
            newKeyPrefix: generated.keyPrefix,
          },
        },
        tx,
      );

      return { ...newKey, rawKey: generated.plaintext };
    });

    return result;
  }
}
