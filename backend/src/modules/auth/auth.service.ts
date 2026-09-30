import { Inject, Injectable } from '@nestjs/common';
import { MembershipStatus, OrgRole, OrganizationStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { AuditAction } from '../../common/constants/audit-actions';
import { ErrorCode } from '../../common/constants/error-codes';
import {
  BadRequestAppException,
  ConflictAppException,
  UnauthorizedAppException,
} from '../../common/exceptions/app.exception';
import type { AuditActor } from '../../common/types/request-context';
import { normalizeEmail, slugify } from '../../common/utils/string.util';
import { APP_CONFIG } from '../../config/config.module';
import type { Configuration } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { USER_PUBLIC_SELECT, type UserPublicRow } from '../users/dto/user.dto';

import { PasswordService } from './password.service';
import { TokenService } from './token.service';

export interface RegisterResult {
  user: UserPublicRow;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  expiresInSeconds: number;
  organization?: { id: string; slug: string; name: string } | null;
}

export interface LoginResult {
  user: UserPublicRow;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  expiresInSeconds: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: Configuration,
  ) {}

  async register(input: {
    email: string;
    name: string;
    password: string;
    organizationName?: string;
    actor: AuditActor;
  }): Promise<RegisterResult> {
    const email = normalizeEmail(input.email);
    const passwordHash = await this.password.hash(input.password);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictAppException(
        'This email is already registered.',
        ErrorCode.EMAIL_ALREADY_REGISTERED,
      );
    }

    const now = new Date();
    const familyId = randomUUID();
    const issued = this.tokens.issueRefreshToken(now);
    const accessToken = await this.tokens.signAccessToken({ id: '', email });

    let user: UserPublicRow;
    let organization: { id: string; slug: string; name: string } | null = null;

    if (this.config.auth.autoCreateOrganizationOnRegister) {
      const orgName = input.organizationName || `${input.name}'s Organization`;
      const orgSlug = slugify(orgName) || `org-${randomUUID().slice(0, 8)}`;

      const result = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: { email, name: input.name, passwordHash, lastLoginAt: now },
          select: USER_PUBLIC_SELECT,
        });

        const createdOrg = await tx.organization.create({
          data: {
            name: orgName,
            slug: orgSlug,
            ownerUserId: createdUser.id,
            memberships: {
              create: {
                userId: createdUser.id,
                role: OrgRole.OWNER,
                status: MembershipStatus.ACTIVE,
              },
            },
          },
          select: { id: true, slug: true, name: true },
        });

        await tx.refreshToken.create({
          data: {
            userId: createdUser.id,
            familyId,
            tokenHash: issued.hash,
            expiresAt: issued.expiresAt,
            userAgent: input.actor.userAgent,
            ipAddress: input.actor.ipAddress,
            lastUsedAt: now,
          },
        });

        await this.audit.record(
          {
            action: AuditAction.USER_REGISTERED,
            resourceType: 'User',
            resourceId: createdUser.id,
            organizationId: null,
            actor: { ...input.actor, userId: createdUser.id },
          },
          tx,
        );

        await this.audit.record(
          {
            action: AuditAction.ORGANIZATION_CREATED,
            resourceType: 'Organization',
            resourceId: createdOrg.id,
            organizationId: createdOrg.id,
            actor: { ...input.actor, userId: createdUser.id },
            metadata: { autoCreated: true },
          },
          tx,
        );

        return { user: createdUser, organization: createdOrg };
      });

      user = result.user;
      organization = result.organization;
    } else {
      user = await this.prisma.user.create({
        data: { email, name: input.name, passwordHash, lastLoginAt: now },
        select: USER_PUBLIC_SELECT,
      });

      await this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          familyId,
          tokenHash: issued.hash,
          expiresAt: issued.expiresAt,
          userAgent: input.actor.userAgent,
          ipAddress: input.actor.ipAddress,
          lastUsedAt: now,
        },
      });

      this.audit.recordDetached({
        action: AuditAction.USER_REGISTERED,
        resourceType: 'User',
        resourceId: user.id,
        organizationId: null,
        actor: { ...input.actor, userId: user.id },
      });
    }

    const signedAccess = await this.tokens.signAccessToken({ id: user.id, email: user.email });

    return {
      user,
      accessToken: signedAccess.token,
      refreshToken: issued.raw,
      refreshTokenExpiresAt: issued.expiresAt,
      expiresInSeconds: signedAccess.expiresInSeconds,
      organization,
    };
  }

  async login(input: {
    email: string;
    password: string;
    actor: AuditActor;
  }): Promise<LoginResult> {
    const email = normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { ...USER_PUBLIC_SELECT, passwordHash: true },
    });

    const valid = user ? await this.password.verify(user.passwordHash, input.password) : false;
    if (!user || !valid) {
      throw new UnauthorizedAppException(
        'Invalid email or password.',
        ErrorCode.INVALID_CREDENTIALS,
      );
    }

    const now = new Date();
    const familyId = randomUUID();
    const issued = this.tokens.issueRefreshToken(now);

    await this.prisma.$transaction([
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          familyId,
          tokenHash: issued.hash,
          expiresAt: issued.expiresAt,
          userAgent: input.actor.userAgent,
          ipAddress: input.actor.ipAddress,
          lastUsedAt: now,
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now },
      }),
    ]);

    this.audit.recordDetached({
      action: AuditAction.USER_LOGGED_IN,
      resourceType: 'User',
      resourceId: user.id,
      organizationId: null,
      actor: { ...input.actor, userId: user.id },
    });

    const signedAccess = await this.tokens.signAccessToken({ id: user.id, email: user.email });
    const { passwordHash: _, ...publicUser } = user;

    return {
      user: publicUser,
      accessToken: signedAccess.token,
      refreshToken: issued.raw,
      refreshTokenExpiresAt: issued.expiresAt,
      expiresInSeconds: signedAccess.expiresInSeconds,
    };
  }

  async refresh(input: {
    rawToken: string;
    actor: AuditActor;
  }): Promise<{ accessToken: string; refreshToken: string; expiresInSeconds: number }> {
    const hash = this.tokens.hashRefreshToken(input.rawToken);
    const now = new Date();

    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
        replacedById: true,
      },
    });

    if (!existing || existing.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedAppException('Refresh token is invalid or expired.', ErrorCode.TOKEN_EXPIRED);
    }

    if (existing.revokedAt || existing.replacedById) {
      await this.revokeFamily(existing.familyId, 'reuse_detected');
      this.audit.recordDetached({
        action: AuditAction.TOKEN_REUSE_DETECTED,
        resourceType: 'RefreshToken',
        resourceId: existing.id,
        organizationId: null,
        actor: { ...input.actor, userId: existing.userId },
        metadata: { familyId: existing.familyId },
      });
      throw new UnauthorizedAppException(
        'This refresh token has already been used. The session family has been revoked.',
        ErrorCode.TOKEN_REUSE_DETECTED,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: existing.userId },
      select: { id: true, email: true, status: true },
    });
    if (!user) {
      throw new UnauthorizedAppException('Refresh token is invalid.', ErrorCode.TOKEN_INVALID);
    }

    const issued = this.tokens.issueRefreshToken(now);
    const signedAccess = await this.tokens.signAccessToken({ id: user.id, email: user.email });

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { replacedById: randomUUID(), lastUsedAt: now },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          familyId: existing.familyId,
          tokenHash: issued.hash,
          expiresAt: issued.expiresAt,
          userAgent: input.actor.userAgent,
          ipAddress: input.actor.ipAddress,
          lastUsedAt: now,
        },
      }),
    ]);

    this.audit.recordDetached({
      action: AuditAction.TOKEN_REFRESHED,
      resourceType: 'RefreshToken',
      resourceId: existing.id,
      organizationId: null,
      actor: { ...input.actor, userId: user.id },
    });

    return {
      accessToken: signedAccess.token,
      refreshToken: issued.raw,
      expiresInSeconds: signedAccess.expiresInSeconds,
    };
  }

  async logout(userId: string, rawToken: string, actor: AuditActor): Promise<number> {
    const hash = this.tokens.hashRefreshToken(rawToken);
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      select: { id: true, userId: true, revokedAt: true },
    });

    if (!token || token.userId !== userId) {
      throw new BadRequestAppException('Invalid refresh token.', ErrorCode.TOKEN_INVALID);
    }
    if (token.revokedAt) {
      return 0;
    }

    await this.prisma.refreshToken.update({
      where: { id: token.id },
      data: { revokedAt: new Date(), revokedReason: 'user_logout' },
    });

    this.audit.recordDetached({
      action: AuditAction.USER_LOGGED_OUT,
      resourceType: 'User',
      resourceId: userId,
      organizationId: null,
      actor,
    });

    return 1;
  }

  async logoutAll(userId: string, actor: AuditActor): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'user_logout_all' },
    });

    this.audit.recordDetached({
      action: AuditAction.USER_LOGGED_OUT_ALL,
      resourceType: 'User',
      resourceId: userId,
      organizationId: null,
      actor,
    });

    return result.count;
  }

  async getUserOrganizations(
    userId: string,
  ): Promise<Array<{ id: string; name: string; slug: string; role: OrgRole }>> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      select: {
        role: true,
        organization: { select: { id: true, name: true, slug: true, status: true } },
      },
    });

    return memberships
      .filter((m) => m.organization.status !== OrganizationStatus.ARCHIVED)
      .map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      }));
  }

  private async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
}
