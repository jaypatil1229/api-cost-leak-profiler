import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgRole } from '@prisma/client';

import { ErrorCode } from '../constants/error-codes';
import {
  ORG_ROLES_KEY,
  REQUIRE_PROJECT_KEY,
  roleSatisfies,
} from '../decorators/authorization.decorators';
import {
  ForbiddenAppException,
  NotFoundAppException,
  UnauthorizedAppException,
} from '../exceptions/app.exception';
import { TenantAccessService } from '../services/tenant-access.service';
import type { RequestContext } from '../types/request-context';

/**
 * Resolves a `:projectId` route parameter into a verified project scope.
 *
 * The project's organization is read from the project row and membership is then
 * checked against it, so a caller cannot reach another tenant's project by
 * pairing its id with an organization they do belong to. Both
 * `request.projectContext` and `request.orgContext` are populated, which lets a
 * route require a role without also nesting under `/organizations/:id`.
 *
 * Activated per route by `@RequireProjectRole()` / `@RequireProjectAccess()`.
 */
@Injectable()
export class ProjectScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(REQUIRE_PROJECT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestContext>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedAppException('Authentication is required for this resource.');
    }

    const projectId = (request.params as Record<string, string | undefined> | undefined)?.projectId;
    if (!projectId) {
      // A programming error rather than a client error: the decorator was applied
      // to a route without a :projectId parameter.
      throw new NotFoundAppException('Project');
    }

    const { project, organization } = await this.tenantAccess.requireProjectAccess(
      user.id,
      projectId,
    );
    request.projectContext = project;
    request.orgContext = organization;

    const minimumRole =
      this.reflector.getAllAndOverride<OrgRole | undefined>(ORG_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? OrgRole.VIEWER;

    if (!roleSatisfies(organization.role, minimumRole)) {
      throw new ForbiddenAppException(
        `This action requires the ${minimumRole} role or higher.`,
        ErrorCode.INSUFFICIENT_ROLE,
      );
    }

    return true;
  }
}
