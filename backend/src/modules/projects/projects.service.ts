import { Injectable } from '@nestjs/common';
import { ProjectEnvironment, ProjectStatus, Prisma } from '@prisma/client';

import { AuditAction } from '../../common/constants/audit-actions';
import { ErrorCode } from '../../common/constants/error-codes';
import { ConflictAppException } from '../../common/exceptions/app.exception';
import { AuditService } from '../../common/services/audit.service';
import type { AuditActor } from '../../common/types/request-context';
import { slugify } from '../../common/utils/string.util';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findById(projectId: string, organizationId: string) {
    return this.prisma.project.findFirstOrThrow({
      where: { id: projectId, organizationId },
      select: {
        id: true,
        organizationId: true,
        name: true,
        slug: true,
        description: true,
        environment: true,
        status: true,
        archivedAt: true,
        createdByUserId: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { apiKeys: true } },
      },
    });
  }

  async create(input: {
    organizationId: string;
    name: string;
    slug?: string;
    description?: string;
    environment?: ProjectEnvironment;
    createdByUserId: string;
    actor: AuditActor;
  }) {
    const finalSlug = input.slug || slugify(input.name) || `proj-${Date.now()}`;

    const existing = await this.prisma.project.findUnique({
      where: { organizationId_slug: { organizationId: input.organizationId, slug: finalSlug } },
    });

    if (existing) {
      throw new ConflictAppException(
        `A project with slug "${finalSlug}" already exists in this organization.`,
        ErrorCode.SLUG_ALREADY_TAKEN,
      );
    }

    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          organizationId: input.organizationId,
          name: input.name,
          slug: finalSlug,
          description: input.description,
          environment: input.environment || ProjectEnvironment.DEVELOPMENT,
          createdByUserId: input.createdByUserId,
        },
      });

      await this.audit.record(
        {
          action: AuditAction.PROJECT_CREATED,
          resourceType: 'Project',
          resourceId: created.id,
          organizationId: input.organizationId,
          actor: input.actor,
        },
        tx,
      );

      return created;
    });

    return project;
  }

  async update(input: {
    projectId: string;
    organizationId: string;
    name?: string;
    slug?: string;
    description?: string;
    environment?: ProjectEnvironment;
    actor: AuditActor;
  }) {
    if (input.slug) {
      const existing = await this.prisma.project.findFirst({
        where: {
          organizationId: input.organizationId,
          slug: input.slug,
          id: { not: input.projectId },
        },
      });

      if (existing) {
        throw new ConflictAppException(
          `A project with slug "${input.slug}" already exists in this organization.`,
          ErrorCode.SLUG_ALREADY_TAKEN,
        );
      }
    }

    const data: Prisma.ProjectUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.description !== undefined) data.description = input.description;
    if (input.environment !== undefined) data.environment = input.environment;

    const project = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({
        where: { id: input.projectId },
        data,
      });

      await this.audit.record(
        {
          action: AuditAction.PROJECT_UPDATED,
          resourceType: 'Project',
          resourceId: updated.id,
          organizationId: input.organizationId,
          actor: input.actor,
          metadata: data,
        },
        tx,
      );

      return updated;
    });

    return project;
  }

  async archive(input: { projectId: string; organizationId: string; actor: AuditActor }) {
    const project = await this.prisma.$transaction(async (tx) => {
      const archived = await tx.project.update({
        where: { id: input.projectId },
        data: { status: ProjectStatus.ARCHIVED, archivedAt: new Date() },
      });

      await this.audit.record(
        {
          action: AuditAction.PROJECT_ARCHIVED,
          resourceType: 'Project',
          resourceId: archived.id,
          organizationId: input.organizationId,
          actor: input.actor,
        },
        tx,
      );

      return archived;
    });

    return project;
  }

  async restore(input: { projectId: string; organizationId: string; actor: AuditActor }) {
    const project = await this.prisma.$transaction(async (tx) => {
      const restored = await tx.project.update({
        where: { id: input.projectId },
        data: { status: ProjectStatus.ACTIVE, archivedAt: null },
      });

      await this.audit.record(
        {
          action: AuditAction.PROJECT_RESTORED,
          resourceType: 'Project',
          resourceId: restored.id,
          organizationId: input.organizationId,
          actor: input.actor,
        },
        tx,
      );

      return restored;
    });

    return project;
  }

  async listByOrganization(organizationId: string, includeArchived = false) {
    const projects = await this.prisma.project.findMany({
      where: {
        organizationId,
        ...(includeArchived ? {} : { status: ProjectStatus.ACTIVE }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return projects;
  }
}
