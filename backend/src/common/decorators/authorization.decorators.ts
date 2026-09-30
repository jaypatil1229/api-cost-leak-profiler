import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiKeyScope, OrgRole } from '@prisma/client';

export const ORG_ROLES_KEY = 'aclp:orgRoles';
export const REQUIRE_ORG_KEY = 'aclp:requireOrg';
export const REQUIRE_PROJECT_KEY = 'aclp:requireProject';
export const API_KEY_SCOPES_KEY = 'aclp:apiKeyScopes';

/**
 * Role hierarchy. A role satisfies a requirement when its rank is greater than
 * or equal to the required role's rank.
 */
export const ORG_ROLE_RANK: Record<OrgRole, number> = {
  [OrgRole.VIEWER]: 0,
  [OrgRole.MEMBER]: 1,
  [OrgRole.ADMIN]: 2,
  [OrgRole.OWNER]: 3,
};

export function roleSatisfies(actual: OrgRole, required: OrgRole): boolean {
  return ORG_ROLE_RANK[actual] >= ORG_ROLE_RANK[required];
}

/**
 * Requires an organization scope with at least `minimumRole`.
 *
 * Applying this decorator is what activates `OrganizationContextGuard` for a
 * route; without it the guard does not resolve an organization at all.
 */
export const RequireOrgRole = (minimumRole: OrgRole) =>
  applyDecorators(SetMetadata(REQUIRE_ORG_KEY, true), SetMetadata(ORG_ROLES_KEY, minimumRole));

/** Requires an organization scope with any active membership role. */
export const RequireOrgMembership = () => RequireOrgRole(OrgRole.VIEWER);

/**
 * Requires a `:projectId` route parameter that resolves to a project whose
 * organization the caller belongs to with at least `minimumRole`.
 *
 * Activates `ProjectScopeGuard`, which derives the organization from the project
 * rather than trusting anything the client sent, and populates both
 * `request.projectContext` and `request.orgContext`.
 */
export const RequireProjectRole = (minimumRole: OrgRole) =>
  applyDecorators(SetMetadata(REQUIRE_PROJECT_KEY, true), SetMetadata(ORG_ROLES_KEY, minimumRole));

/** Requires project scope with any active membership role. */
export const RequireProjectAccess = () => RequireProjectRole(OrgRole.VIEWER);

/**
 * Requires the authenticated API key to hold every listed scope.
 * Used together with `ApiKeyAuthGuard` on ingestion routes.
 */
export const RequireApiKeyScopes = (...scopes: ApiKeyScope[]) =>
  SetMetadata(API_KEY_SCOPES_KEY, scopes);
