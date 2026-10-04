import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectEnvironment, ProjectStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { SLUG_PATTERN } from '../../organizations/dto/organization.dto';

export class CreateProjectDto {
  @ApiProperty({ example: 'Production API', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    example: 'production-api',
    maxLength: 64,
    description: 'Project-unique URL-safe identifier. Derived from name when omitted.',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(SLUG_PATTERN, {
    message: 'slug must contain only lower-case letters, digits and single hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: ProjectEnvironment, enumName: 'ProjectEnvironment' })
  @IsOptional()
  @IsEnum(ProjectEnvironment)
  environment?: ProjectEnvironment;
}

export class UpdateProjectDto {
  @ApiPropertyOptional({ example: 'Production API v2', maxLength: 120 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'prod-api-v2', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(SLUG_PATTERN)
  slug?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: ProjectEnvironment, enumName: 'ProjectEnvironment' })
  @IsOptional()
  @IsEnum(ProjectEnvironment)
  environment?: ProjectEnvironment;
}

export class ProjectResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ example: 'Production API' })
  name!: string;

  @ApiProperty({ example: 'production-api' })
  slug!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 1000 })
  description!: string | null;

  @ApiProperty({ enum: ProjectEnvironment, enumName: 'ProjectEnvironment' })
  environment!: ProjectEnvironment;

  @ApiProperty({ enum: ProjectStatus, enumName: 'ProjectStatus' })
  status!: ProjectStatus;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  archivedAt!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  createdByUserId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
