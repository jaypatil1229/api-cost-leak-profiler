import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';

import { UserResponseDto } from '../../users/dto/user.dto';

export class AuthTokensDto {
  @ApiProperty({ description: 'Short-lived HS256 JWT. Send as `Authorization: Bearer <token>`.' })
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ example: 900, description: 'Access token lifetime in seconds.' })
  expiresIn!: number;

  @ApiProperty({
    description:
      'Opaque, single-use refresh token. Store it in a secure, httpOnly cookie or the platform keychain — never in localStorage.',
  })
  refreshToken!: string;

  @ApiProperty({ format: 'date-time' })
  refreshTokenExpiresAt!: string;
}

export class OrganizationSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Acme Inc' })
  name!: string;

  @ApiProperty({ example: 'acme-inc' })
  slug!: string;

  @ApiProperty({ enum: OrgRole, enumName: 'OrgRole' })
  role!: OrgRole;
}

export class AuthSessionResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;

  @ApiProperty({ type: AuthTokensDto })
  tokens!: AuthTokensDto;

  @ApiPropertyOptional({
    type: OrganizationSummaryDto,
    nullable: true,
    description:
      'Organization created during registration, when AUTO_CREATE_ORGANIZATION_ON_REGISTER is enabled. Null for logins and when disabled.',
  })
  organization?: OrganizationSummaryDto | null;
}

export class CurrentUserResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;

  @ApiProperty({
    type: [OrganizationSummaryDto],
    description: 'Organizations the caller is an active member of, with their role in each.',
  })
  organizations!: OrganizationSummaryDto[];
}

export class LogoutResponseDto {
  @ApiProperty({ example: 1, description: 'Number of refresh sessions revoked.' })
  revokedSessions!: number;
}
