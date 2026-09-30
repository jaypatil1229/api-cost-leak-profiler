import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';

import { ErrorCode } from '../../common/constants/error-codes';
import { UnauthorizedAppException } from '../../common/exceptions/app.exception';
import { hmacSha256Hex, randomToken } from '../../common/utils/crypto.util';
import { APP_CONFIG } from '../../config/config.module';
import type { Configuration } from '../../config/configuration';

/** Claims carried by an access token. Kept minimal — no roles, no org list. */
export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  email: string;
  /** Token id, echoed into logs for correlation. */
  jti: string;
  /** Discriminator so a refresh artefact can never be replayed as an access token. */
  typ: 'access';
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export interface IssuedAccessToken {
  token: string;
  tokenId: string;
  expiresInSeconds: number;
}

export interface IssuedRefreshToken {
  /** Returned to the client once; never persisted. */
  raw: string;
  /** What is stored: HMAC of the raw token keyed with JWT_REFRESH_SECRET. */
  hash: string;
  expiresAt: Date;
  expiresInSeconds: number;
}

/**
 * Token issuance and verification.
 *
 * Design decisions:
 *  * Access tokens are stateless HS256 JWTs with a short TTL. They are not
 *    revocable on their own — revocation happens at refresh time. The TTL is
 *    therefore the worst-case window and is kept small by default (15m).
 *  * Refresh tokens are **opaque high-entropy strings**, not JWTs. They are
 *    stored as a keyed HMAC so that a database dump alone cannot be replayed,
 *    and because opaque tokens can be individually revoked and rotated
 *    (see `AuthService` for rotation and reuse detection).
 *  * Roles are deliberately NOT embedded in the access token: membership is
 *    re-checked against the database on every organization-scoped request, so
 *    a role change or removal takes effect immediately.
 */
@Injectable()
export class TokenService {
  /** Entropy of an opaque refresh token. */
  private static readonly REFRESH_TOKEN_BYTES = 48;

  constructor(
    private readonly jwtService: JwtService,
    @Inject(APP_CONFIG) private readonly config: Configuration,
  ) {}

  async signAccessToken(user: { id: string; email: string }): Promise<IssuedAccessToken> {
    const { auth } = this.config;
    const tokenId = randomUUID();
    const token = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, typ: 'access' } satisfies Omit<AccessTokenClaims, 'jti'>,
      {
        secret: auth.accessSecret,
        algorithm: 'HS256',
        expiresIn: auth.accessTokenTtlSeconds,
        issuer: auth.issuer,
        audience: auth.audience,
        jwtid: tokenId,
      },
    );
    return { token, tokenId, expiresInSeconds: auth.accessTokenTtlSeconds };
  }

  /**
   * Verifies signature, expiry, issuer and audience. Throws a 401 carrying a
   * distinguishable code so clients know whether to refresh or re-authenticate.
   */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const { auth } = this.config;
    let claims: AccessTokenClaims;
    try {
      claims = await this.jwtService.verifyAsync<AccessTokenClaims>(token, {
        secret: auth.accessSecret,
        algorithms: ['HS256'],
        issuer: auth.issuer,
        audience: auth.audience,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw new UnauthorizedAppException('Access token has expired.', ErrorCode.TOKEN_EXPIRED);
      }
      throw new UnauthorizedAppException('Access token is invalid.', ErrorCode.TOKEN_INVALID);
    }

    if (claims.typ !== 'access' || typeof claims.sub !== 'string' || claims.sub.length === 0) {
      throw new UnauthorizedAppException('Access token is invalid.', ErrorCode.TOKEN_INVALID);
    }
    return claims;
  }

  issueRefreshToken(now = new Date()): IssuedRefreshToken {
    const expiresInSeconds = this.config.auth.refreshTokenTtlSeconds;
    const raw = randomToken(TokenService.REFRESH_TOKEN_BYTES);
    return {
      raw,
      hash: this.hashRefreshToken(raw),
      expiresAt: new Date(now.getTime() + expiresInSeconds * 1000),
      expiresInSeconds,
    };
  }

  /** Deterministic lookup key for a presented refresh token. */
  hashRefreshToken(raw: string): string {
    return hmacSha256Hex(raw, this.config.auth.refreshSecret);
  }
}
