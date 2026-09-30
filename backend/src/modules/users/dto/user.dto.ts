import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma, UserStatus } from '@prisma/client';

/**
 * The only projection used to read users for API responses.
 *
 * `passwordHash` is absent by construction, so no endpoint can leak it by
 * forgetting to strip a field. Use this select (or a narrower one) everywhere a
 * user is read for output.
 */
export const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  name: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type UserPublicRow = Prisma.UserGetPayload<{ select: typeof USER_PUBLIC_SELECT }>;

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ada@example.com' })
  email!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  name!: string;

  @ApiProperty({ enum: UserStatus, enumName: 'UserStatus' })
  status!: UserStatus;

  @ApiProperty({
    example: false,
    description:
      'Whether the address has been verified. Email verification is scaffolded but no email is sent — see README "Extension points".',
  })
  emailVerified!: boolean;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  lastLoginAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export function toUserResponse(user: UserPublicRow): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    emailVerified: user.emailVerifiedAt !== null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
