import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserStatus } from '@prisma/client';

import { ErrorCode } from '../../../common/constants/error-codes';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { UnauthorizedAppException } from '../../../common/exceptions/app.exception';
import type { RequestContext } from '../../../common/types/request-context';
import { PrismaService } from '../../../database/prisma.service';
import { TokenService } from '../token.service';

/**
 * Authenticates a user access token. Registered globally in `AppModule`, so
 * every route requires a token unless it opts out with `@Public()` or
 * `@ApiKeyAuthenticated()`.
 *
 * The user row is re-read on every request. That is one indexed primary-key
 * lookup, and it buys immediate effect for suspension and deletion instead of
 * waiting out the access-token TTL. If this ever becomes a hot path, the fix is
 * a short-lived cache keyed by user id — not embedding status in the token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestContext>();
    const token = this.bearerTokenFrom(request);
    if (!token) {
      throw new UnauthorizedAppException('A bearer access token is required.');
    }

    const claims = await this.tokenService.verifyAccessToken(token);

    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, email: true, name: true, status: true },
    });

    // A valid signature over a deleted user is still a failed authentication.
    if (!user) {
      throw new UnauthorizedAppException('Access token is invalid.', ErrorCode.TOKEN_INVALID);
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedAppException('This account is not active.', ErrorCode.UNAUTHORIZED);
    }

    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      tokenId: claims.jti,
    };
    return true;
  }

  private bearerTokenFrom(request: RequestContext): string | null {
    const header = request.headers.authorization;
    if (typeof header !== 'string') {
      return null;
    }
    const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
    return match ? match[1] : null;
  }
}
