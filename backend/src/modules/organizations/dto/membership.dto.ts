import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvitationStatus, MembershipStatus, OrgRole } from '@prisma/client';
import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Roles that can be granted through the membership and invitation APIs. */
const ASSIGNABLE_ROLES = [OrgRole.ADMIN, OrgRole.MEMBER, OrgRole.VIEWER] as const;

export class InviteMemberDto {
  @ApiProperty({ example: 'grace@example.com', maxLength: 320 })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(320)
  email!: string;

  @ApiProperty({
    enum: ASSIGNABLE_ROLES,
    enumName: 'AssignableOrgRole',
    description:
      'OWNER cannot be granted by invitation — use POST /organizations/:id/transfer-ownership.',
  })
  @IsIn(ASSIGNABLE_ROLES, { message: 'role must be one of ADMIN, MEMBER, VIEWER' })
  role!: (typeof ASSIGNABLE_ROLES)[number];
}

export class UpdateMemberRoleDto {
  @ApiProperty({
    enum: ASSIGNABLE_ROLES,
    enumName: 'AssignableOrgRole',
    description: 'OWNER cannot be assigned here — use the ownership transfer endpoint.',
  })
  @IsIn(ASSIGNABLE_ROLES, { message: 'role must be one of ADMIN, MEMBER, VIEWER' })
  role!: (typeof ASSIGNABLE_ROLES)[number];
}

export class AcceptInvitationDto {
  @ApiProperty({ description: 'The raw invitation token. Only its hash is stored server-side.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token!: string;
}

export class MemberResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Membership id.' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 'grace@example.com' })
  email!: string;

  @ApiProperty({ example: 'Grace Hopper' })
  name!: string;

  @ApiProperty({ enum: OrgRole, enumName: 'OrgRole' })
  role!: OrgRole;

  @ApiProperty({ enum: MembershipStatus, enumName: 'MembershipStatus' })
  status!: MembershipStatus;

  @ApiProperty({ example: false, description: 'True for the organization owner.' })
  isOwner!: boolean;

  @ApiProperty({ format: 'date-time' })
  joinedAt!: string;
}

export class InvitationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ example: 'grace@example.com' })
  email!: string;

  @ApiProperty({ enum: OrgRole, enumName: 'OrgRole' })
  role!: OrgRole;

  @ApiProperty({ enum: InvitationStatus, enumName: 'InvitationStatus' })
  status!: InvitationStatus;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  invitedByUserId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class InvitationDeliveryDto {
  @ApiProperty({
    example: false,
    description:
      'Always false: no email transport is implemented in this phase. Deliver the token out of band.',
  })
  emailSent!: boolean;

  @ApiProperty({
    example:
      'No email was sent. ACLP has no mail transport configured; share the invitation token with the invitee yourself.',
  })
  note!: string;
}

export class InvitationCreatedResponseDto {
  @ApiProperty({ type: InvitationResponseDto })
  invitation!: InvitationResponseDto;

  @ApiProperty({
    description: 'Raw invitation token. Shown exactly once — only its SHA-256 hash is persisted.',
  })
  token!: string;

  @ApiProperty({ type: InvitationDeliveryDto })
  delivery!: InvitationDeliveryDto;
}

export class AcceptInvitationResponseDto {
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ example: 'acme-inc' })
  organizationSlug!: string;

  @ApiProperty({ enum: OrgRole, enumName: 'OrgRole' })
  role!: OrgRole;
}
