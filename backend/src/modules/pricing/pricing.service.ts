import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  ConflictAppException,
  NotFoundAppException,
} from '../../common/exceptions/app.exception';
import { toMoneyString } from '../../common/utils/money.util';
import { APP_CONFIG } from '../../config/config.module';
import type { Configuration } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';

import type {
  CreateModelPricingDto,
  ModelPricingResponseDto,
  PricingQueryDto,
  UpdateModelPricingDto,
} from './dto/pricing.dto';

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) _config: Configuration,
  ) {}

  async list(query: PricingQueryDto): Promise<ModelPricingResponseDto[]> {
    const where: Prisma.ModelPricingWhereInput = {};
    if (query.provider) where.provider = query.provider;
    if (query.model) where.model = { contains: query.model, mode: 'insensitive' };
    if (query.isVerified !== undefined) where.isVerified = query.isVerified;

    const rows = await this.prisma.modelPricing.findMany({
      where,
      orderBy: [{ provider: 'asc' }, { model: 'asc' }, { effectiveFrom: 'desc' }],
    });

    return rows.map(mapPricingToDto);
  }

  async getById(id: string): Promise<ModelPricingResponseDto> {
    const row = await this.prisma.modelPricing.findUnique({ where: { id } });
    if (!row) throw new NotFoundAppException('Pricing entry not found.');
    return mapPricingToDto(row);
  }

  async create(dto: CreateModelPricingDto): Promise<ModelPricingResponseDto> {
    try {
      const row = await this.prisma.modelPricing.create({
        data: {
          provider: dto.provider,
          model: dto.model,
          inputRatePerMillionTokens: new Prisma.Decimal(dto.inputRatePerMillionTokens),
          outputRatePerMillionTokens: new Prisma.Decimal(dto.outputRatePerMillionTokens),
          cachedInputRatePerMillionTokens: dto.cachedInputRatePerMillionTokens
            ? new Prisma.Decimal(dto.cachedInputRatePerMillionTokens)
            : undefined,
          version: dto.version,
          source: dto.source ?? null,
          notes: dto.notes ?? null,
          isVerified: dto.isVerified ?? false,
          effectiveFrom: new Date(dto.effectiveFrom),
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        },
      });
      return mapPricingToDto(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictAppException(
          `Pricing already exists for ${dto.provider}/${dto.model} version "${dto.version}".`,
        );
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateModelPricingDto): Promise<ModelPricingResponseDto> {
    await this.getById(id);

    const data: Prisma.ModelPricingUpdateInput = {};
    if (dto.inputRatePerMillionTokens !== undefined)
      data.inputRatePerMillionTokens = new Prisma.Decimal(dto.inputRatePerMillionTokens);
    if (dto.outputRatePerMillionTokens !== undefined)
      data.outputRatePerMillionTokens = new Prisma.Decimal(dto.outputRatePerMillionTokens);
    if (dto.cachedInputRatePerMillionTokens !== undefined)
      data.cachedInputRatePerMillionTokens = new Prisma.Decimal(dto.cachedInputRatePerMillionTokens);
    if (dto.source !== undefined) data.source = dto.source;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.isVerified !== undefined) data.isVerified = dto.isVerified;
    if (dto.effectiveTo !== undefined) data.effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;

    const row = await this.prisma.modelPricing.update({ where: { id }, data });
    return mapPricingToDto(row);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.modelPricing.delete({ where: { id } });
  }
}

function mapPricingToDto(row: any): ModelPricingResponseDto {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    inputRatePerMillionTokens: toMoneyString(row.inputRatePerMillionTokens) ?? '0',
    outputRatePerMillionTokens: toMoneyString(row.outputRatePerMillionTokens) ?? '0',
    cachedInputRatePerMillionTokens: toMoneyString(row.cachedInputRatePerMillionTokens),
    currency: row.currency,
    version: row.version,
    source: row.source,
    notes: row.notes,
    isVerified: row.isVerified,
    effectiveFrom: row.effectiveFrom instanceof Date ? row.effectiveFrom.toISOString() : row.effectiveFrom,
    effectiveTo: row.effectiveTo instanceof Date ? row.effectiveTo.toISOString() : row.effectiveTo,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}
