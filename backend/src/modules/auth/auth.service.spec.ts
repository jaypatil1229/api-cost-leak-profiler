import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { APP_CONFIG } from '../../config/config.module';

import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { UnauthorizedAppException } from '../../common/exceptions/app.exception';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<PrismaService>;
  let passwordService: jest.Mocked<PasswordService>;
  let tokenService: jest.Mocked<TokenService>;

  const mockConfig = {
    auth: {
      jwtSecret: 'test-secret',
      jwtExpiresIn: '15m',
      refreshTokenTtlSeconds: 604800,
      refreshSecret: 'test-refresh-secret',
      accessSecret: 'test-access-secret',
      accessTokenTtlSeconds: 900,
      issuer: 'aclp-test',
      audience: 'aclp-test-client',
      autoCreateOrganizationOnRegister: false,
    },
  };

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    passwordHash: 'hashed-password',
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            refreshToken: {
              create: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
            },
            $transaction: jest.fn((operation) =>
              typeof operation === 'function' ? operation(prisma) : Promise.all(operation),
            ),
          },
        },
        {
          provide: PasswordService,
          useValue: {
            hash: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            issueRefreshToken: jest.fn(() => ({
              raw: 'refresh-token-raw',
              hash: 'refresh-token-hash',
              expiresAt: new Date(Date.now() + 604800000),
              expiresInSeconds: 604800,
            })),
            hashRefreshToken: jest.fn(() => 'refresh-token-hash'),
            signAccessToken: jest.fn().mockResolvedValue({
              token: 'access-token',
              tokenId: 'access-id',
              expiresInSeconds: 900,
            }),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            record: jest.fn().mockResolvedValue(undefined),
            recordDetached: jest.fn(),
          },
        },
        {
          provide: APP_CONFIG,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<jest.Mocked<PrismaService>>(PrismaService);
    passwordService = module.get<jest.Mocked<PasswordService>>(PasswordService);
    tokenService = module.get<jest.Mocked<TokenService>>(TokenService);
  });

  describe('register', () => {
    it('should create a new user with hashed password', async () => {
      const input = {
        email: 'new@example.com',
        password: 'StrongPass123!',
        name: 'New User',
        actor: { ip: '127.0.0.1', userAgent: 'test' },
      };

      prisma.user.findUnique.mockResolvedValue(null);
      passwordService.hash.mockResolvedValue('hashed-password');
      prisma.user.create.mockResolvedValue({ ...mockUser, email: input.email, name: input.name });

      const result = await service.register(input);

      expect(result.user).toEqual(expect.objectContaining({
        id: mockUser.id,
        email: 'new@example.com',
        name: input.name,
        status: mockUser.status,
      }));
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token-raw');
      expect(passwordService.hash).toHaveBeenCalledWith(input.password);
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it('should reject duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'test@example.com',
          password: 'Pass123!',
          name: 'Test',
          actor: { ip: '127.0.0.1', userAgent: 'test' },
        }),
      ).rejects.toThrow('This email is already registered.');
    });
  });

  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      passwordService.verify.mockResolvedValue(true);
      tokenService.issueRefreshToken.mockReturnValue({
        raw: 'refresh-token-raw', hash: 'refresh-token-hash',
        expiresAt: new Date(Date.now() + 604800000), expiresInSeconds: 604800,
      });
      tokenService.signAccessToken.mockResolvedValue({
        token: 'access-token', tokenId: 'access-id', expiresInSeconds: 900,
      });

      const result = await service.login({
        email: 'test@example.com',
        password: 'correct-password',
        actor: { ip: '127.0.0.1', userAgent: 'test' },
      });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token-raw');
      expect(passwordService.verify).toHaveBeenCalledWith(
        mockUser.passwordHash,
        'correct-password',
      );
    });

    it('should reject invalid credentials with timing-safe error', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      passwordService.verify.mockResolvedValue(false);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'wrong-password',
          actor: { ip: '127.0.0.1', userAgent: 'test' },
        }),
      ).rejects.toThrow(UnauthorizedAppException);
    });

    it('should reject suspended user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        status: UserStatus.SUSPENDED,
      });
      passwordService.verify.mockResolvedValue(true);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'correct-password',
          actor: { ip: '127.0.0.1', userAgent: 'test' },
        }),
      ).rejects.toThrow('Your account has been suspended.');
    });

    it('should reject deactivated user after password verification', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        status: UserStatus.DEACTIVATED,
      });
      passwordService.verify.mockResolvedValue(true);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'correct-password',
          actor: { ip: '127.0.0.1', userAgent: 'test' },
        }),
      ).rejects.toThrow('Your account is not active.');
    });
  });

  describe('refresh', () => {
    it('should issue new tokens on valid refresh', async () => {
      const storedToken = {
        id: 'token-1',
        userId: mockUser.id,
        tokenHash: 'stored-hash',
        expiresAt: new Date(Date.now() + 100000),
        revokedAt: null,
        usedAt: null,
        createdAt: new Date(),
      };

      tokenService.hashRefreshToken.mockReturnValue('stored-hash');
      prisma.refreshToken.findUnique.mockResolvedValue({ ...storedToken, familyId: 'family-1', replacedById: null });
      prisma.user.findUnique.mockResolvedValue(mockUser);
      tokenService.issueRefreshToken.mockReturnValue({
        raw: 'new-refresh-token', hash: 'new-hash',
        expiresAt: new Date(Date.now() + 604800000), expiresInSeconds: 604800,
      });
      tokenService.signAccessToken.mockResolvedValue({
        token: 'new-access-token', tokenId: 'new-access-id', expiresInSeconds: 900,
      });

      const result = await service.refresh({
        rawToken: 'old-refresh-token',
        actor: { ip: '127.0.0.1', userAgent: 'test' },
      });

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });

    it('should reject reused refresh token', async () => {
      const reusedToken = {
        id: 'token-1',
        userId: mockUser.id,
        tokenHash: 'stored-hash',
        expiresAt: new Date(Date.now() + 100000),
        revokedAt: null,
        familyId: 'family-1',
        replacedById: 'replacement-token',
        createdAt: new Date(),
      };

      tokenService.hashRefreshToken.mockReturnValue('stored-hash');
      prisma.refreshToken.findUnique.mockResolvedValue(reusedToken);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.refresh({
          rawToken: 'reused-token',
          actor: { ip: '127.0.0.1', userAgent: 'test' },
        }),
      ).rejects.toThrow('This refresh token has already been used.');
    });

    it('revokes the refresh-token family for an inactive user', async () => {
      tokenService.hashRefreshToken.mockReturnValue('stored-hash');
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'token-1',
        userId: mockUser.id,
        familyId: 'family-1',
        expiresAt: new Date(Date.now() + 100000),
        revokedAt: null,
        replacedById: null,
      });
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, status: UserStatus.SUSPENDED });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.refresh({
          rawToken: 'valid-but-inactive-user-token',
          actor: { ip: '127.0.0.1', userAgent: 'test' },
        }),
      ).rejects.toThrow('Your account has been suspended.');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familyId: 'family-1', revokedAt: null },
          data: expect.objectContaining({ revokedReason: 'account_inactive' }),
        }),
      );
    });
  });
});
