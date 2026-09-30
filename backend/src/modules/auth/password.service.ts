import { Injectable, Logger } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Argon2id parameters. Aligned with the OWASP Password Storage Cheat Sheet
 * recommendation of m=19 MiB, t=2, p=1 as of 2025.
 *
 * Changing these is safe: existing hashes encode their own parameters, so old
 * hashes keep verifying. Re-hashing on next successful login is a documented
 * extension point (`needsRehash` below is not wired into the login path yet).
 */
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Length guard. Argon2 has no practical input limit, but accepting unbounded
 * input would let a caller burn CPU; DTO validation caps it too.
 */
const MAX_PASSWORD_LENGTH = 256;

/**
 * Password hashing.
 *
 * Argon2id is used rather than bcrypt: it is memory-hard, so GPU/ASIC attacks
 * are far more expensive, and it has no 72-byte silent truncation. The
 * `@node-rs/argon2` binding ships prebuilt binaries, so no native toolchain is
 * required on developer machines or in CI.
 */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  async hash(plaintext: string): Promise<string> {
    this.assertLength(plaintext);
    return hash(plaintext, ARGON2_OPTIONS);
  }

  /**
   * Returns false rather than throwing for malformed stored hashes, so a
   * corrupt row cannot be distinguished from a wrong password by the caller.
   */
  async verify(storedHash: string, plaintext: string): Promise<boolean> {
    if (plaintext.length === 0 || plaintext.length > MAX_PASSWORD_LENGTH) {
      return false;
    }
    try {
      return await verify(storedHash, plaintext);
    } catch (error) {
      // Never log the password or the hash.
      this.logger.warn(
        `Password verification failed to run: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
      return false;
    }
  }

  /**
   * Extension point: returns true when a stored hash was produced with weaker
   * parameters than the current policy and should be upgraded after a
   * successful login. Not yet called from the login path — see README,
   * "Next steps".
   */
  needsRehash(storedHash: string): boolean {
    const memoryMatch = /\$m=(\d+)/.exec(storedHash);
    if (!storedHash.startsWith('$argon2id$') || !memoryMatch) {
      return true;
    }
    return Number(memoryMatch[1]) < ARGON2_OPTIONS.memoryCost;
  }

  private assertLength(plaintext: string): void {
    if (plaintext.length === 0 || plaintext.length > MAX_PASSWORD_LENGTH) {
      throw new Error(`Password must be between 1 and ${MAX_PASSWORD_LENGTH} characters.`);
    }
  }
}
