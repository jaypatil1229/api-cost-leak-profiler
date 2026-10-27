import { Inject, Injectable, Logger } from '@nestjs/common';
import { OrganizationStatus, ProjectStatus } from '@prisma/client';

import { ErrorCode } from '../../common/constants/error-codes';
import {
  ForbiddenAppException,
  UnauthorizedAppException,
} from '../../common/exceptions/app.exception';
import type { ApiKeyContext } from '../../common/types/request-context';
import { parseApiKey, verifyApiKeySecret } from '../../common/utils/api-key.util';
import { APP_CONFIG } from '../../config/config.module';
import type { Configuration } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';

/**
 * Verifies presented SDK keys.
 *
 * Lookup is O(1): the public `keyPrefix` embedded in the key is uniquely
 * indexed, so exactly one row is read, and the secret half is then compared
 * against its stored HMAC in constant time.
 *
 * Checks are ordered so that key *state* (revoked / expired) is only disclosed
 * to a caller who actually holds the matching secret. An unknown prefix and a
 * wrong secret are reported identically.
 *
 * LIMITATION: the prefix lookup itself is not constant-time with respect to
 * whether a prefix exists. That leaks only the existence of a 12-character
 * public identifier, which is not a secret.
 */
@Injectable()
export class ApiKeyVerificationService {
  private readonly logger = new Logger(ApiKeyVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: Configuration,
  ) {}

  async verify(rawKey: string, now: Date = new Date()): Promise<ApiKeyContext> {
    const parsed = parseApiKey(rawKey);
    if (!parsed) {
      throw new UnauthorizedAppException('API key is invalid.', ErrorCode.API_KEY_INVALID);
    }

    const record = await this.prisma.apiKey.findUnique({
      where: { keyPrefix: parsed.keyPrefix },
      select: {
        id: true,
        keyHash: true,
        keyPrefix: true,
        scopes: true,
        organizationId: true,
        projectId: true,
        revokedAt: true,
        expiresAt: true,
        lastUsedAt: true,
        project: { select: { status: true } },
        organization: { select: { status: true } },
      },
    });

    // Same error for "no such prefix" and "wrong secret".
    if (
      !record ||
      !verifyApiKeySecret(parsed.secret, record.keyHash, this.config.auth.apiKeyHmacSecret)
    ) {
      throw new UnauthorizedAppException('API key is invalid.', ErrorCode.API_KEY_INVALID);
    }

    if (record.revokedAt) {
      throw new UnauthorizedAppException(
        'This API key has been revoked.',
        ErrorCode.API_KEY_REVOKED,
      );
    }
    if (record.expiresAt && record.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedAppException('This API key has expired.', ErrorCode.API_KEY_EXPIRED);
    }
    if (record.organization.status === OrganizationStatus.ARCHIVED) {
      throw new ForbiddenAppException(
        'The organization for this API key is archived.',
        ErrorCode.ORGANIZATION_ACCESS_DENIED,
      );
    }
    if (record.project.status !== ProjectStatus.ACTIVE) {
      throw new ForbiddenAppException(
        'The project for this API key is archived. Ingestion is disabled for archived projects.',
        ErrorCode.PROJECT_ACCESS_DENIED,
      );
    }

    this.touchLastUsed(record.id, record.lastUsedAt, now);

    return {
      apiKeyId: record.id,
      organizationId: record.organizationId,
      projectId: record.projectId,
      scopes: record.scopes,
      keyPrefix: record.keyPrefix,
    };
  }

  /**
   * Records key activity at most once per `API_KEY_LAST_USED_THROTTLE_SECONDS`.
   *
   * Writing on every ingestion request would add a row update to the hottest
   * path in the system for a field only used for reporting. The update is also
   * deliberately not awaited: a failure to record activity must never fail
   * ingestion.
   */
  private touchLastUsed(apiKeyId: string, lastUsedAt: Date | null, now: Date): void {
    const thresholdMs = this.config.limits.apiKeyLastUsedThrottleSeconds * 1000;
    if (lastUsedAt && now.getTime() - lastUsedAt.getTime() < thresholdMs) {
      return;
    }

    void this.prisma.apiKey
      .update({ where: { id: apiKeyId }, data: { lastUsedAt: now } })
      .catch((error: unknown) => {
        this.logger.debug(
          `Could not update lastUsedAt for API key ${apiKeyId}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      });
  }
}
