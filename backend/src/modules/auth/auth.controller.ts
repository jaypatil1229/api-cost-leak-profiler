import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { CurrentUser } from '../../common/decorators/context.decorators';
import { Public } from '../../common/decorators/public.decorator';
import {
  ApiCreatedEnvelope,
  ApiOkEnvelope,
  ApiStandardErrors,
} from '../../common/decorators/swagger.decorators';
import { RateLimitBucket } from '../../common/decorators/throttle.decorators';
import type { AuthenticatedUser, RequestContext } from '../../common/types/request-context';
import { Req } from '../../common/decorators/context.decorators';
import { auditActorFromRequest } from '../../common/types/request-context';
import { toUserResponse } from '../users/dto/user.dto';

import { AuthService } from './auth.service';
import {
  type AuthSessionResponseDto,
  type AuthTokensDto,
  type CurrentUserResponseDto,
  type LogoutResponseDto,
  type OrganizationSummaryDto,
} from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @RateLimitBucket('auth')
  @SkipThrottle()
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates a new user account. When AUTO_CREATE_ORGANIZATION_ON_REGISTER is enabled, also creates an organization owned by the user.',
  })
  @ApiCreatedEnvelope()
  @ApiStandardErrors({ auth: false })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: RequestContext,
  ): Promise<AuthSessionResponseDto> {
    const result = await this.authService.register({
      email: dto.email,
      name: dto.name,
      password: dto.password,
      organizationName: dto.organizationName,
      actor: auditActorFromRequest(req),
    });

    const tokens: AuthTokensDto = {
      accessToken: result.accessToken,
      tokenType: 'Bearer',
      expiresIn: result.expiresInSeconds,
      refreshToken: result.refreshToken,
      refreshTokenExpiresAt: result.refreshTokenExpiresAt.toISOString(),
    };

    const organization: OrganizationSummaryDto | null = result.organization
      ? {
          id: result.organization.id,
          name: result.organization.name,
          slug: result.organization.slug,
          role: 'OWNER' as const,
        }
      : null;

    return {
      user: toUserResponse(result.user),
      tokens,
      organization,
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimitBucket('auth')
  @SkipThrottle()
  @ApiOperation({
    summary: 'Log in',
    description:
      'Authenticates with email and password. Returns an access token and a refresh token.',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors({ auth: false })
  async login(@Body() dto: LoginDto, @Req() req: RequestContext): Promise<AuthSessionResponseDto> {
    const result = await this.authService.login({
      email: dto.email,
      password: dto.password,
      actor: auditActorFromRequest(req),
    });

    const tokens: AuthTokensDto = {
      accessToken: result.accessToken,
      tokenType: 'Bearer',
      expiresIn: result.expiresInSeconds,
      refreshToken: result.refreshToken,
      refreshTokenExpiresAt: result.refreshTokenExpiresAt.toISOString(),
    };

    return {
      user: toUserResponse(result.user),
      tokens,
      organization: null,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Exchanges a refresh token for a new access token and a new refresh token. The presented refresh token is rotated and can no longer be used.',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors({ auth: false })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: RequestContext,
  ): Promise<{ tokens: AuthTokensDto }> {
    const result = await this.authService.refresh({
      rawToken: dto.refreshToken,
      actor: auditActorFromRequest(req),
    });

    const tokens: AuthTokensDto = {
      accessToken: result.accessToken,
      tokenType: 'Bearer',
      expiresIn: result.expiresInSeconds,
      refreshToken: result.refreshToken,
      refreshTokenExpiresAt: new Date(
        Date.now() + result.expiresInSeconds * 1000,
      ).toISOString(),
    };

    return { tokens };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out',
    description:
      'Revokes the presented refresh token. The access token remains valid until it expires.',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors()
  async logout(
    @Body() dto: RefreshTokenDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestContext,
  ): Promise<LogoutResponseDto> {
    const revokedSessions = await this.authService.logout(
      user.id,
      dto.refreshToken,
      auditActorFromRequest(req),
    );
    return { revokedSessions };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out from all sessions',
    description: 'Revokes every active refresh token for the authenticated user.',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors()
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestContext,
  ): Promise<LogoutResponseDto> {
    const revokedSessions = await this.authService.logoutAll(
      user.id,
      auditActorFromRequest(req),
    );
    return { revokedSessions };
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get current user',
    description: 'Returns the authenticated user and the organizations they belong to.',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors()
  async me(@CurrentUser() user: AuthenticatedUser): Promise<CurrentUserResponseDto> {
    const organizations = await this.authService.getUserOrganizations(user.id);

    return {
      user: toUserResponse({
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
        emailVerifiedAt: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      organizations: organizations.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: org.role,
      })),
    };
  }
}
