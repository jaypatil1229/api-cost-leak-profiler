import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiKeyScope } from '@prisma/client';
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Production SDK Key', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    enum: ApiKeyScope,
    enumName: 'ApiKeyScope',
    isArray: true,
    example: [ApiKeyScope.USAGE_WRITE],
  })
  @IsArray()
  @IsEnum(ApiKeyScope, { each: true })
  scopes!: ApiKeyScope[];

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Optional expiration date. Never expires when omitted.',
  })
  @IsOptional()
  expiresAt?: string;
}

export class ApiKeyResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ example: 'Production SDK Key' })
  name!: string;

  @ApiProperty({ example: 'aclp_a7k3m9x2qp4t…', description: 'Public key prefix with ellipsis. Never shows the secret.' })
  keyPrefix!: string;

  @ApiProperty({ enum: ApiKeyScope, enumName: 'ApiKeyScope', isArray: true })
  scopes!: ApiKeyScope[];

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  lastUsedAt!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  expiresAt!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  revokedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class ApiKeyCreatedResponseDto extends ApiKeyResponseDto {
  @ApiProperty({
    example: 'aclp_a7k3m9x2qp4t_dGhpc19pc19hX3NlY3JldF9rZXk',
    description: 'Full API key. Shown exactly once — store it securely.',
  })
  rawKey!: string;
}
