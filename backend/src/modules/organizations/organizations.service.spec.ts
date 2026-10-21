import { Test, TestingModule } from '@nestjs/testing';
import { MembershipStatus, OrgRole, OrganizationStatus } from '@prisma/client';

import { ConflictAppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { APP_CONFIG } from '../../config/config.module';

import { OrganizationsService } from './organizations.service';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: jest.Mocked<PrismaService>;

  const mockConfig = {
    limits: {
      defaultPageSize: 25,
      maxPageSize: 100,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        {
          provide: PrismaService,
          useValue: {
            organization: {
              findUnique: jest.fn(),
              create: jest.fn(),
              findUniqueOrThrow: jest.fn(),
            },
            $transaction: jest.fn((fn) => fn(prisma)),
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

    service = module.get<OrganizationsService>(OrganizationsService);
    prisma = module.get<jest.Mocked<PrismaService>>(PrismaService);
  });

  describe('create', () => {
    it('should create organization with owner membership', async () => {
      const input = {
        name: 'Acme Inc',
        slug: 'acme-inc',
        userId: 'user-1',
        actor: { ip: '127.0.0.1', userAgent: 'test' },
      };

      const mockOrg = {
        id: 'org-1',
        name: input.name,
        slug: input.slug,
        ownerUserId: input.userId,
        status: OrganizationStatus.ACTIVE,
        plan: 'FREE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.organization.findUnique.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue(mockOrg);

      const result = await service.create(input);

      expect(result.slug).toBe(input.slug);
      expect(prisma.organization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: input.name,
            slug: input.slug,
            ownerUserId: input.userId,
            memberships: expect.objectContaining({
              create: expect.objectContaining({
                userId: input.userId,
                role: OrgRole.OWNER,
                status: MembershipStatus.ACTIVE,
              }),
            }),
          }),
        }),
      );
    });

    it('should reject duplicate slug', async () => {
      const existingOrg = {
        id: 'org-1',
        slug: 'acme-inc',
        name: 'Acme Inc',
      };

      prisma.organization.findUnique.mockResolvedValue(existingOrg as any);

      await expect(
        service.create({
          name: 'Another Acme',
          slug: 'acme-inc',
          userId: 'user-1',
          actor: { ip: '127.0.0.1', userAgent: 'test' },
        }),
      ).rejects.toThrow(ConflictAppException);
    });

    it('should auto-generate slug from name', async () => {
      const input = {
        name: 'Tech Startup LLC',
        userId: 'user-1',
        actor: { ip: '127.0.0.1', userAgent: 'test' },
      };

      prisma.organization.findUnique.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({
        id: 'org-1',
        slug: 'tech-startup-llc',
      } as any);

      const result = await service.create(input);

      expect(result.slug).toBe('tech-startup-llc');

      expect(prisma.organization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: 'tech-startup-llc',
          }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('should return organization with counts', async () => {
      const mockOrg = {
        id: 'org-1',
        name: 'Acme Inc',
        slug: 'acme-inc',
        plan: 'FREE',
        status: OrganizationStatus.ACTIVE,
        ownerUserId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: {
          memberships: 3,
          projects: 5,
        },
      };

      prisma.organization.findUniqueOrThrow.mockResolvedValue(mockOrg as any);

      const result = await service.findById('org-1');

      expect(result.id).toBe('org-1');
      expect(result._count.memberships).toBe(3);
      expect(result._count.projects).toBe(5);
    });
  });
});
