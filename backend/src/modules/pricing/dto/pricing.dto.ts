import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Provider } from '@prisma/client';

export class CreateModelPricingDto {
  @ApiProperty({ enum: Provider, enumName: 'Provider' })
  @IsEnum(Provider)
  provider!: Provider;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  model!: string;

  @ApiProperty({ description: 'Cost per million input tokens as a decimal string.', example: '3.0000000000' })
  @IsString()
  inputRatePerMillionTokens!: string;

  @ApiProperty({ description: 'Cost per million output tokens as a decimal string.', example: '15.0000000000' })
  @IsString()
  outputRatePerMillionTokens!: string;

  @ApiPropertyOptional({ description: 'Cost per million cached input tokens.' })
  @IsOptional()
  @IsString()
  cachedInputRatePerMillionTokens?: string;

  @ApiProperty({ maxLength: 64 })
  @IsString()
  @MaxLength(64)
  version!: string;

  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  source?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class UpdateModelPricingDto {
  @ApiPropertyOptional({ description: 'Cost per million input tokens as a decimal string.' })
  @IsOptional()
  @IsString()
  inputRatePerMillionTokens?: string;

  @ApiPropertyOptional({ description: 'Cost per million output tokens as a decimal string.' })
  @IsOptional()
  @IsString()
  outputRatePerMillionTokens?: string;

  @ApiPropertyOptional({ description: 'Cost per million cached input tokens.' })
  @IsOptional()
  @IsString()
  cachedInputRatePerMillionTokens?: string;

  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  source?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class ModelPricingResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: Provider, enumName: 'Provider' })
  provider!: Provider;

  @ApiProperty()
  model!: string;

  @ApiProperty()
  inputRatePerMillionTokens!: string;

  @ApiProperty()
  outputRatePerMillionTokens!: string;

  @ApiPropertyOptional({ nullable: true })
  cachedInputRatePerMillionTokens!: string | null;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  version!: string;

  @ApiPropertyOptional({ nullable: true })
  source!: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  isVerified!: boolean;

  @ApiProperty({ format: 'date-time' })
  effectiveFrom!: string;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  effectiveTo!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class PricingQueryDto {
  @ApiPropertyOptional({ enum: Provider, enumName: 'Provider' })
  @IsOptional()
  @IsEnum(Provider)
  provider?: Provider;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isVerified?: boolean;
}
