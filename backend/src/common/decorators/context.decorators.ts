import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type {
  ApiKeyContext,
  AuthenticatedUser,
  OrganizationContext,
  ProjectContext,
  RequestContext,
} from '../types/request-context';

/**
 * The authenticated user. Guaranteed present on any route not marked `@Public()`
 * because `JwtAuthGuard` rejects the request otherwise.
 */
export const CurrentUser = createParamDecorator(
  (property: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestContext>();
    const user = request.user;
    if (!user) {
      return undefined;
    }
    return property ? user[property] : user;
  },
);

/**
 * The verified organization scope. Only available on routes protected by
 * `OrganizationContextGuard` — its presence means membership was checked.
 */
export const CurrentOrganization = createParamDecorator(
  (property: keyof OrganizationContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestContext>();
    const orgContext = request.orgContext;
    if (!orgContext) {
      return undefined;
    }
    return property ? orgContext[property] : orgContext;
  },
);

/** The verified project scope, set by `ProjectScopeGuard`. */
export const CurrentProject = createParamDecorator(
  (property: keyof ProjectContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestContext>();
    const projectContext = request.projectContext;
    if (!projectContext) {
      return undefined;
    }
    return property ? projectContext[property] : projectContext;
  },
);

/** The authenticated SDK key, set by `ApiKeyAuthGuard` on ingestion routes. */
export const CurrentApiKey = createParamDecorator(
  (property: keyof ApiKeyContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestContext>();
    const apiKeyContext = request.apiKeyContext;
    if (!apiKeyContext) {
      return undefined;
    }
    return property ? apiKeyContext[property] : apiKeyContext;
  },
);

/** The whole request, typed with ACLP's context extensions. */
export const Req = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<RequestContext>(),
);
