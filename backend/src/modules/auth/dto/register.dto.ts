import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsStrongPassword,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Shared policy so register and (future) password reset cannot drift apart. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export class RegisterDto {
  @ApiProperty({ example: 'ada@example.com', maxLength: 320 })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: 'Ada Lovelace', minLength: 1, maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: 'correct-horse-Battery-9',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description:
      'At least 12 characters with an upper-case letter, a lower-case letter and a digit. Symbols are allowed but not required.',
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsStrongPassword(
    {
      minLength: PASSWORD_MIN_LENGTH,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 0,
    },
    {
      message:
        'password must be at least 12 characters and contain an upper-case letter, a lower-case letter and a digit',
    },
  )
  password!: string;

  @ApiPropertyOptional({
    example: 'Acme Inc',
    maxLength: 120,
    description:
      'Name for the organization created alongside the account. Ignored when AUTO_CREATE_ORGANIZATION_ON_REGISTER=false; defaults to "<name>\'s Organization" when omitted.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  organizationName?: string;
}
