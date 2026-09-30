import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Reusable `:id` path parameter with UUID validation. */
export class UuidParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  id!: string;
}

export class OrganizationIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  organizationId!: string;
}

export class ProjectIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  projectId!: string;
}
