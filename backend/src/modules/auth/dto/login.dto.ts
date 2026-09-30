import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ada@example.com', maxLength: 320 })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(320)
  email!: string;

  /**
   * Intentionally validated only for presence and length. Applying the
   * registration password policy here would let an attacker learn which
   * candidate passwords are even *possible* for an account.
   */
  @ApiProperty({ example: 'correct-horse-Battery-9', maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
