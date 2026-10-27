import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrgRole, OrganizationPlan, OrganizationStatus } from '@prisma/client';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Slug format: lower-case alphanumeric words separated by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Inc', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    example: 'acme-inc',
    maxLength: 64,
    description: 'Globally unique URL-safe identifier. Derived from the name when omitted.',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(SLUG_PATTERN, {
    message: 'slug must contain only lower-case letters, digits and single hyphens',
  })
  slug?: string;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Acme Incorporated', maxLength: 120 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'acme', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(SLUG_PATTERN, {
    message: 'slug must contain only lower-case letters, digits and single hyphens',
  })
  slug?: string;
}

export class TransferOwnershipDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'User id of an existing active member who becomes OWNER. The current owner is demoted to ADMIN in the same transaction.',
  })
  @IsUUID()
  userId!: string;
}

export class OrganizationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Acme Inc' })
  name!: string;

  @ApiProperty({ example: 'acme-inc' })
  slug!: string;

  @ApiProperty({ enum: OrganizationPlan, enumName: 'OrganizationPlan' })
  plan!: OrganizationPlan;

  @ApiProperty({ enum: OrganizationStatus, enumName: 'OrganizationStatus' })
  status!: OrganizationStatus;

  @ApiProperty({ format: 'uuid' })
  ownerUserId!: string;

  @ApiPropertyOptional({
    enum: OrgRole,
    enumName: 'OrgRole',
    description: "The requesting user's role in this organization.",
  })
  role?: OrgRole;

  @ApiPropertyOptional({ example: 3 })
  memberCount?: number;

  @ApiPropertyOptional({ example: 2 })
  projectCount?: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
