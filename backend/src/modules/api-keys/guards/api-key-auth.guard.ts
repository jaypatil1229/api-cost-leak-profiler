import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiKeyScope } from '@prisma/client';

import { API_KEY_HEADER } from '../../../common/constants/app.constants';
import { ErrorCode } from '../../../common/constants/error-codes';
import { API_KEY_SCOPES_KEY } from '../../../common/decorators/authorization.decorators';
import {
  ForbiddenAppException,
  UnauthorizedAppException,
} from '../../../common/exceptions/app.exception';
import type { RequestContext } from '../../../common/types/request-context';
import { ApiKeyVerificationService } from '../api-key-verification.service';

/**
 * Authenticates an SDK API key. Deliberately a **separate** guard from
 * `JwtAuthGuard`: the two credential types authenticate different subjects (a
 * project vs. a person), carry different authorities, and must never be
 * interchangeable. Routes using this guard opt out of the global JWT guard with
 * `@ApiKeyAuthenticated()`.
 *
 * The key is accepted in `x-api-key` or as `Authorization: Bearer <key>`; the
 * former is preferred because it cannot be confused with a user access token.
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeyVerification: ApiKeyVerificationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestContext>();

    const rawKey = this.extractKey(request);
    if (!rawKey) {
      throw new UnauthorizedAppException(
        `An API key is required in the ${API_KEY_HEADER} header.`,
        ErrorCode.API_KEY_INVALID,
      );
    }

    const apiKeyContext = await this.apiKeyVerification.verify(rawKey);

    const requiredScopes =
      this.reflector.getAllAndOverride<ApiKeyScope[] | undefined>(API_KEY_SCOPES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const missing = requiredScopes.filter((scope) => !apiKeyContext.scopes.includes(scope));
    if (missing.length > 0) {
      throw new ForbiddenAppException(
        `This API key is missing required scope(s): ${missing.join(', ')}.`,
        ErrorCode.INSUFFICIENT_SCOPE,
      );
    }

    request.apiKeyContext = apiKeyContext;
    // An API key never authenticates a person; make that explicit downstream.
    request.user = undefined;
    return true;
  }

  private extractKey(request: RequestContext): string | null {
    const header = request.headers[API_KEY_HEADER];
    if (typeof header === 'string' && header.trim().length > 0) {
      return header.trim();
    }
    const authorization = request.headers.authorization;
    if (typeof authorization === 'string') {
      const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
      if (match) {
        return match[1];
      }
    }
    return null;
  }
}
