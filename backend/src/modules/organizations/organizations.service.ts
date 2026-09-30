import { Inject, Injectable } from '@nestjs/common';
import { MembershipStatus, OrgRole, OrganizationStatus, Prisma } from '@prisma/client';

import { AuditAction } from '../../common/constants/audit-actions';
import { ErrorCode } from '../../common/constants/error-codes';
import {
  ConflictAppException,
  ForbiddenAppException,
  NotFoundAppException,
} from '../../common/exceptions/app.exception';
import { AuditService } from '../../common/services/audit.service';
import type { AuditActor } from '../../common/types/request-context';
import { normalizeEmail, slugify } from '../../common/utils/string.util';
import { APP_CONFIG } from '../../config/config.module';
import type { Configuration } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: Configuration,
  ) {}

  async findById(organizationId: string) {
    return this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        status: true,
        ownerUserId: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { memberships: true, projects: true } },
      },
    });
  }

  async create(input: {
    name: string;
    slug?: string;
    userId: string;
    actor: AuditActor;
  }) {
    const finalSlug = input.slug || slugify(input.name) || `org-${Date.now()}`;

    const existing = await this.prisma.organization.findUnique({ where: { slug: finalSlug } });
    if (existing) {
      throw new ConflictAppException(
        `The slug "${finalSlug}" is already taken.`,
        ErrorCode.SLUG_ALREADY_TAKEN,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: input.name,
          slug: finalSlug,
          ownerUserId: input.userId,
          memberships: {
            create: {
              userId: input.userId,
              role: OrgRole.OWNER,
              status: MembershipStatus.ACTIVE,
            },
          },
        },
        include: {
          memberships: {
            where: { userId: input.userId },
            select: { id: true, role: true },
          },
        },
      });

      await this.audit.record(
        {
          action: AuditAction.ORGANIZATION_CREATED,
          resourceType: 'Organization',
          resourceId: org.id,
          organizationId: org.id,
          actor: input.actor,
        },
        tx,
      );

      return org;
    });

    return result;
  }

  async update(input: {
    organizationId: string;
    name?: string;
    slug?: string;
    actor: AuditActor;
  }) {
    if (input.slug) {
      const existing = await this.prisma.organization.findFirst({
        where: { slug: input.slug, id: { not: input.organizationId } },
      });
      if (existing) {
        throw new ConflictAppException(
          `The slug "${input.slug}" is already taken.`,
          ErrorCode.SLUG_ALREADY_TAKEN,
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id: input.organizationId },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.slug ? { slug: input.slug } : {}),
        },
      });

      await this.audit.record(
        {
          action: AuditAction.ORGANIZATION_UPDATED,
          resourceType: 'Organization',
          resourceId: org.id,
          organizationId: org.id,
          actor: input.actor,
          metadata: {
            ...(input.name ? { name: input.name } : {}),
            ...(input.slug ? { slug: input.slug } : {}),
          },
        },
        tx,
      );

      return org;
    });

    return updated;
  }

  async transferOwnership(input: {
    organizationId: string;
    currentOwnerId: string;
    newOwnerId: string;
    actor: AuditActor;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const newOwnerMembership = await tx.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: input.newOwnerId,
            organizationId: input.organizationId,
          },
        },
      });

      if (!newOwnerMembership || newOwnerMembership.status !== MembershipStatus.ACTIVE) {
        throw new ForbiddenAppException(
          'The new owner must be an active member of the organization.',
        );
      }

      await tx.organization.update({
        where: { id: input.organizationId },
        data: { ownerUserId: input.newOwnerId },
      });

      await tx.organizationMembership.update({
        where: { id: newOwnerMembership.id },
        data: { role: OrgRole.OWNER },
      });

      const currentOwnerMembership = await tx.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: input.currentOwnerId,
            organizationId: input.organizationId,
          },
        },
      });

      if (currentOwnerMembership) {
        await tx.organizationMembership.update({
          where: { id: currentOwnerMembership.id },
          data: { role: OrgRole.ADMIN },
        });
      }

      await this.audit.record(
        {
          action: AuditAction.ORGANIZATION_OWNERSHIP_TRANSFERRED,
          resourceType: 'Organization',
          resourceId: input.organizationId,
          organizationId: input.organizationId,
          actor: input.actor,
          metadata: {
            fromUserId: input.currentOwnerId,
            toUserId: input.newOwnerId,
          },
        },
        tx,
      );
    });
  }

  async listMembers(organizationId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
        organization: {
          select: { ownerUserId: true },
        },
      },
      orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }],
    });

    return memberships.map((m) => ({
      id: m.id,
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      status: m.status,
      isOwner: m.userId === m.organization.ownerUserId,
      joinedAt: m.joinedAt,
    }));
  }

  async removeMember(input: {
    organizationId: string;
    membershipId: string;
    actor: AuditActor;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const membership = await tx.organizationMembership.findUnique({
        where: { id: input.membershipId },
        include: { organization: { select: { ownerUserId: true } } },
      });

      if (!membership || membership.organizationId !== input.organizationId) {
        throw new NotFoundAppException('Membership', input.membershipId);
      }

      if (membership.userId === membership.organization.ownerUserId) {
        throw new ConflictAppException(
          'The organization owner cannot be removed. Transfer ownership first.',
          ErrorCode.LAST_OWNER,
        );
      }

      await tx.organizationMembership.delete({ where: { id: input.membershipId } });

      await this.audit.record(
        {
          action: AuditAction.MEMBER_REMOVED,
          resourceType: 'OrganizationMembership',
          resourceId: input.membershipId,
          organizationId: input.organizationId,
          actor: input.actor,
          metadata: { removedUserId: membership.userId },
        },
        tx,
      );
    });
  }
}
