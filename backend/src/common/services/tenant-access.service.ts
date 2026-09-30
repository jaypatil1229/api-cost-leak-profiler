import { Injectable } from '@nestjs/common';
import { MembershipStatus, OrganizationStatus, ProjectStatus } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { NotFoundAppException } from '../exceptions/app.exception';
import type { OrganizationContext, ProjectContext } from '../types/request-context';
import { isUuid } from '../utils/string.util';

/**
 * Single source of truth for tenant access checks.
 *
 * Guards and services both use it so that the rule "a caller may only see rows
 * belonging to an organization they are an ACTIVE member of" is implemented in
 * exactly one place.
 *
 * Every failure is reported as 404 rather than 403. Returning 403 would confirm
 * that a given organization or project id exists, which is an information leak
 * across tenants.
 */
@Injectable()
export class TenantAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Verifies ACTIVE membership in a usable organization. */
  async requireMembership(userId: string, organizationId: string): Promise<OrganizationContext> {
    if (!isUuid(organizationId)) {
      throw new NotFoundAppException('Organization', organizationId);
    }

    const membership = await this.prisma.organizationMembership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: {
        id: true,
        role: true,
        status: true,
        organization: { select: { id: true, slug: true, status: true } },
      },
    });

    if (
      !membership ||
      membership.status !== MembershipStatus.ACTIVE ||
      membership.organization.status === OrganizationStatus.ARCHIVED
    ) {
      throw new NotFoundAppException('Organization', organizationId);
    }

    return {
      organizationId: membership.organization.id,
      organizationSlug: membership.organization.slug,
      membershipId: membership.id,
      role: membership.role,
    };
  }

  /**
   * Resolves a project *and* the caller's membership in its organization.
   * The organization is derived from the project row — never from the request —
   * so a caller cannot pair someone else's project with their own organization.
   */
  async requireProjectAccess(
    userId: string,
    projectId: string,
  ): Promise<{ project: ProjectContext; organization: OrganizationContext }> {
    if (!isUuid(projectId)) {
      throw new NotFoundAppException('Project', projectId);
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, slug: true, organizationId: true },
    });
    if (!project) {
      throw new NotFoundAppException('Project', projectId);
    }

    const organization = await this.requireMembership(userId, project.organizationId);

    return {
      project: {
        projectId: project.id,
        projectSlug: project.slug,
        organizationId: project.organizationId,
      },
      organization,
    };
  }

  /**
   * Validates that a project id supplied as a *filter* belongs to the already
   * verified organization scope. Used by usage/cost/report queries, where the
   * organization comes from `orgContext` and the project from the query string.
   */
  async requireProjectInOrganization(
    organizationId: string,
    projectId: string,
    options: { includeArchived?: boolean } = {},
  ): Promise<ProjectContext> {
    if (!isUuid(projectId)) {
      throw new NotFoundAppException('Project', projectId);
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId,
        ...(options.includeArchived ? {} : { status: ProjectStatus.ACTIVE }),
      },
      select: { id: true, slug: true, organizationId: true },
    });
    if (!project) {
      throw new NotFoundAppException('Project', projectId);
    }

    return {
      projectId: project.id,
      projectSlug: project.slug,
      organizationId: project.organizationId,
    };
  }

  /** Ids of every project in the organization; used to bound "all projects" queries. */
  async projectIdsForOrganization(organizationId: string): Promise<string[]> {
    const projects = await this.prisma.project.findMany({
      where: { organizationId },
      select: { id: true },
    });
    return projects.map((project) => project.id);
  }
}
