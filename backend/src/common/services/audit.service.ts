import { Injectable, Logger } from '@nestjs/common';
import { AuditActorType, Prisma } from '@prisma/client';

import type { AuditActionValue } from '../constants/audit-actions';
import { PrismaService } from '../../database/prisma.service';
import type { AuditActor } from '../types/request-context';
import { sanitizeMetadata } from '../utils/metadata.util';

export interface AuditEntryInput {
  action: AuditActionValue;
  resourceType: string;
  resourceId?: string | null;
  organizationId?: string | null;
  actor: AuditActor;
  /** Ids and enum values only. Sanitised before persistence; never secrets. */
  metadata?: Record<string, unknown>;
}

/**
 * Writes the append-only audit trail.
 *
 * Two deliberate choices:
 *  * `record` accepts an optional Prisma transaction client, so an audit row can
 *    be written inside the same transaction as the change it describes. State
 *    changes that matter (role changes, key revocation, ownership transfer) use
 *    this form, so the trail cannot diverge from reality.
 *  * `recordDetached` never throws. It is used for events that are not part of a
 *    transaction (logins, logouts) where losing an audit row must not fail the
 *    user's request. Failures are logged.
 *
 * Metadata is passed through the same sanitiser as SDK metadata, so a caller
 * cannot accidentally persist a token or password into the trail.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: AuditEntryInput,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    await client.auditLog.create({ data: this.toCreateInput(input) });
  }

  /** Fire-and-forget variant. Logs, but never rethrows. */
  recordDetached(input: AuditEntryInput): void {
    void this.record(input).catch((error: unknown) => {
      this.logger.warn(
        `Failed to write audit log "${input.action}": ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    });
  }

  private toCreateInput(input: AuditEntryInput): Prisma.AuditLogUncheckedCreateInput {
    const sanitized = input.metadata ? sanitizeMetadata(input.metadata).metadata : null;

    return {
      organizationId: input.organizationId ?? null,
      actorType: this.actorTypeFor(input.actor),
      actorUserId: input.actor.userId ?? null,
      actorApiKeyId: input.actor.apiKeyId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      metadata: sanitized ? sanitized : Prisma.JsonNull,
      ipAddress: input.actor.ipAddress ?? null,
      userAgent: input.actor.userAgent?.slice(0, 512) ?? null,
      requestId: input.actor.requestId?.slice(0, 64) ?? null,
    };
  }

  private actorTypeFor(actor: AuditActor): AuditActorType {
    if (actor.userId) {
      return AuditActorType.USER;
    }
    if (actor.apiKeyId) {
      return AuditActorType.API_KEY;
    }
    return AuditActorType.SYSTEM;
  }
}
