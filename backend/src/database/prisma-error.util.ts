import { Prisma } from '@prisma/client';

/**
 * Prisma error codes this application handles explicitly.
 * @see https://www.prisma.io/docs/orm/reference/error-reference
 */
export const PrismaErrorCode = {
  UNIQUE_CONSTRAINT: 'P2002',
  FOREIGN_KEY_CONSTRAINT: 'P2003',
  RECORD_NOT_FOUND: 'P2025',
  DEPENDS_ON_MISSING_RECORD: 'P2015',
  VALUE_TOO_LONG: 'P2000',
  TRANSACTION_CONFLICT: 'P2034',
} as const;

export function isPrismaKnownError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

export function isUniqueConstraintError(error: unknown): boolean {
  return isPrismaKnownError(error) && error.code === PrismaErrorCode.UNIQUE_CONSTRAINT;
}

export function isRecordNotFoundError(error: unknown): boolean {
  return isPrismaKnownError(error) && error.code === PrismaErrorCode.RECORD_NOT_FOUND;
}

/**
 * True when the client could not establish a connection (bad/absent
 * DATABASE_URL, Postgres down, auth failure). Mapped to 503 rather than 500.
 */
export function isConnectionError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    (isPrismaKnownError(error) && ['P1000', 'P1001', 'P1002', 'P1003', 'P1017'].includes(error.code))
  );
}

/**
 * Extracts the constraint target reported by P2002 (e.g. `["email"]`).
 * Returned to clients as `details.fields` so a 409 is actionable without
 * echoing raw database error text.
 */
export function uniqueConstraintFields(error: unknown): string[] {
  if (!isUniqueConstraintError(error)) {
    return [];
  }
  if (!isPrismaKnownError(error)) {
    return [];
  }
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) {
    return target.filter((entry): entry is string => typeof entry === 'string');
  }
  return typeof target === 'string' ? [target] : [];
}
