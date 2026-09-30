import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ApiCreatedEnvelope,
  ApiOkEnvelope,
  ApiStandardErrors,
} from '../../common/decorators/swagger.decorators';

import {
  CreateModelPricingDto,
  type ModelPricingResponseDto,
  PricingQueryDto,
  UpdateModelPricingDto,
} from './dto/pricing.dto';
import { PricingService } from './pricing.service';

@ApiTags('Pricing')
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get()
  @ApiOperation({
    summary: 'List model pricing entries',
    description: 'Returns all pricing entries, optionally filtered by provider, model name, or verified status.',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors()
  async list(@Query() query: PricingQueryDto): Promise<ModelPricingResponseDto[]> {
    return this.pricingService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get pricing entry by ID' })
  @ApiOkEnvelope()
  @ApiStandardErrors({ notFound: true })
  async getOne(@Param('id') id: string): Promise<ModelPricingResponseDto> {
    return this.pricingService.getById(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create pricing entry',
    description:
      'Creates a new model pricing entry. Unique constraint on (provider, model, version). Mark isVerified=false for development/example data.',
  })
  @ApiCreatedEnvelope()
  @ApiStandardErrors()
  async create(@Body() dto: CreateModelPricingDto): Promise<ModelPricingResponseDto> {
    return this.pricingService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update pricing entry',
    description: 'Updates mutable fields of a pricing entry (rates, source, notes, verified flag, effectiveTo).',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors({ notFound: true })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateModelPricingDto,
  ): Promise<ModelPricingResponseDto> {
    return this.pricingService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete pricing entry',
    description: 'Permanently removes a pricing entry. Usage records that referenced this pricing keep their computed costs.',
  })
  @ApiOkEnvelope()
  @ApiStandardErrors({ notFound: true })
  async remove(@Param('id') id: string): Promise<{ success: true }> {
    await this.pricingService.remove(id);
    return { success: true };
  }
}
