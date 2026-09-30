import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';

import { ErrorCode } from '../../common/constants/error-codes';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { APP_CONFIG } from '../../config/config.module';

import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<PrismaService>;
  let passwordService: jest.Mocked<PasswordService>;
  let tokenService: jest.Mocked<TokenService>;

  const mockConfig = {
    auth: {
      jwtSecret: 'test-secret',
      jwtExpiresIn: '15m',
      refreshTokenTtlMs: 604800000,
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
              findFirst: jest.fn(),
              update: jest.fn(),
              deleteMany: jest.fn(),
            },
            $transaction: jest.fn((fn) => fn(prisma)),
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
            generateAccessToken: jest.fn(),
            generateRefreshToken: jest.fn(),
            hashToken: jest.fn(),
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
            log: jest.fn(),
          },
        },
        {
          provide: APP_CONFIG,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    passwordService = module.get(PasswordService) as jest.Mocked<PasswordService>;
    tokenService = module.get(TokenService) as jest.Mocked<TokenService>;
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
      prisma.user.create.mockResolvedValue(mockUser);

      const result = await service.register(input);

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        status: mockUser.status,
        emailVerifiedAt: mockUser.emailVerifiedAt.toISOString(),
        createdAt: mockUser.createdAt.toISOString(),
      });
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
      ).rejects.toThrow('An account with this email already exists.');
    });
  });

  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      passwordService.verify.mockResolvedValue(true);
      tokenService.generateAccessToken.mockReturnValue('access-token');
      tokenService.generateRefreshToken.mockReturnValue('refresh-token-raw');
      tokenService.hashToken.mockReturnValue('refresh-token-hash');

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
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject suspended user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        status: UserStatus.SUSPENDED,
      });

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'correct-password',
          actor: { ip: '127.0.0.1', userAgent: 'test' },
        }),
      ).rejects.toThrow('Your account has been suspended.');
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

      tokenService.hashToken.mockReturnValue('stored-hash');
      prisma.refreshToken.findFirst.mockResolvedValue(storedToken);
      prisma.user.findUnique.mockResolvedValue(mockUser);
      tokenService.generateAccessToken.mockReturnValue('new-access-token');
      tokenService.generateRefreshToken.mockReturnValue('new-refresh-token');

      const result = await service.refresh({
        refreshToken: 'old-refresh-token',
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
        usedAt: new Date(),
        createdAt: new Date(),
      };

      tokenService.hashToken.mockReturnValue('stored-hash');
      prisma.refreshToken.findFirst.mockResolvedValue(reusedToken);

      await expect(
        service.refresh({
          refreshToken: 'reused-token',
          actor: { ip: '127.0.0.1', userAgent: 'test' },
        }),
      ).rejects.toThrow('Refresh token has already been used');
    });
  });
});
