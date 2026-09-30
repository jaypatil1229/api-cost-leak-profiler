import type { ApiKeyScope, OrgRole, UserStatus } from '@prisma/client';
import type { Request } from 'express';

/** Identity attached by `JwtAuthGuard` after verifying an access token. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  /** Access-token id (jti), used to correlate logs. */
  tokenId?: string;
}

/**
 * Organization scope attached by `OrganizationContextGuard`. Its presence means
 * membership has already been verified against the database — downstream code
 * must use `orgContext.organizationId` and never a client-supplied value.
 */
export interface OrganizationContext {
  organizationId: string;
  organizationSlug: string;
  membershipId: string;
  role: OrgRole;
}

/** Project scope attached by `ProjectScopeGuard`. */
export interface ProjectContext {
  projectId: string;
  projectSlug: string;
  organizationId: string;
}

/**
 * SDK credential attached by `ApiKeyAuthGuard`. Mutually exclusive with `user`:
 * ingestion routes are never authenticated with a user JWT and vice versa.
 */
export interface ApiKeyContext {
  apiKeyId: string;
  organizationId: string;
  projectId: string;
  scopes: ApiKeyScope[];
  keyPrefix: string;
}

export interface RequestContext extends Request {
  /** Correlation id — set by pino-http from `x-request-id` or generated. */
  id?: string;
  user?: AuthenticatedUser;
  orgContext?: OrganizationContext;
  projectContext?: ProjectContext;
  apiKeyContext?: ApiKeyContext;
}

/** Minimal actor description used when writing audit logs. */
export interface AuditActor {
  userId?: string | null;
  apiKeyId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export function auditActorFromRequest(req: RequestContext): AuditActor {
  return {
    userId: req.user?.id ?? null,
    apiKeyId: req.apiKeyContext?.apiKeyId ?? null,
    ipAddress: req.ip ?? null,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    requestId: req.id ?? null,
  };
}
