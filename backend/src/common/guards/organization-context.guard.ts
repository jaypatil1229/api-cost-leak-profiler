import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgRole } from '@prisma/client';

import { ORGANIZATION_ID_HEADER } from '../constants/app.constants';
import { ErrorCode } from '../constants/error-codes';
import {
  ORG_ROLES_KEY,
  REQUIRE_ORG_KEY,
  roleSatisfies,
} from '../decorators/authorization.decorators';
import {
  BadRequestAppException,
  ForbiddenAppException,
  UnauthorizedAppException,
} from '../exceptions/app.exception';
import { TenantAccessService } from '../services/tenant-access.service';
import type { RequestContext } from '../types/request-context';
import { isUuid } from '../utils/string.util';

/**
 * Resolves and verifies the acting organization for a request.
 *
 * Tenancy rules enforced here, once, for every organization-scoped route:
 *  1. The organization id may come from the route (`:organizationId`), the
 *     `x-organization-id` header, or an `organizationId` query parameter — but
 *     it is never trusted. Membership is always re-read from the database.
 *  2. A caller with no ACTIVE membership gets **404, not 403**, so the API does
 *     not disclose whether an organization id exists (IDOR hardening).
 *  3. The verified scope is written to `request.orgContext`. Services must scope
 *     every query by `orgContext.organizationId` and never by a request body or
 *     query value.
 *
 * Activated per route by `@RequireOrgRole()` / `@RequireOrgMembership()`.
 */
@Injectable()
export class OrganizationContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(REQUIRE_ORG_KEY, [
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

    // A previously run guard may already have resolved the same scope.
    if (!request.orgContext) {
      const organizationId = this.resolveOrganizationId(request);
      request.orgContext = await this.tenantAccess.requireMembership(user.id, organizationId);
    }

    const minimumRole =
      this.reflector.getAllAndOverride<OrgRole | undefined>(ORG_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? OrgRole.VIEWER;

    if (!roleSatisfies(request.orgContext.role, minimumRole)) {
      throw new ForbiddenAppException(
        `This action requires the ${minimumRole} role or higher.`,
        ErrorCode.INSUFFICIENT_ROLE,
      );
    }

    return true;
  }

  private resolveOrganizationId(request: RequestContext): string {
    const fromParams = (request.params as Record<string, string | undefined> | undefined)
      ?.organizationId;
    const fromHeader = request.headers[ORGANIZATION_ID_HEADER];
    const fromQuery = (request.query as Record<string, unknown> | undefined)?.organizationId;

    const candidate =
      fromParams ??
      (typeof fromHeader === 'string' ? fromHeader : undefined) ??
      (typeof fromQuery === 'string' ? fromQuery : undefined);

    if (!candidate) {
      throw new BadRequestAppException(
        `An organization is required. Supply it in the route, the ${ORGANIZATION_ID_HEADER} header, or an organizationId query parameter.`,
        ErrorCode.BAD_REQUEST,
      );
    }
    if (!isUuid(candidate)) {
      throw new BadRequestAppException(
        'organizationId must be a UUID.',
        ErrorCode.VALIDATION_ERROR,
      );
    }
    return candidate;
  }
}
