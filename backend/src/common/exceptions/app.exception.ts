import { HttpException, HttpStatus } from '@nestjs/common';

import { ErrorCode, type ErrorCodeValue } from '../constants/error-codes';

export interface AppExceptionPayload {
  code: ErrorCodeValue;
  message: string;
  details?: unknown;
}

/**
 * Base class for domain errors that carry a stable machine-readable code.
 *
 * `AllExceptionsFilter` renders `code`/`message`/`details` directly, so throwing
 * one of these is the only place a code is chosen — controllers never build
 * error bodies by hand. Nest's own `HttpException`s are still supported and are
 * mapped to a code by status.
 */
export class AppException extends HttpException {
  constructor(status: HttpStatus, payload: AppExceptionPayload) {
    super(payload, status);
  }

  get payload(): AppExceptionPayload {
    return this.getResponse() as AppExceptionPayload;
  }
}

export class BadRequestAppException extends AppException {
  constructor(message: string, code: ErrorCodeValue = ErrorCode.BAD_REQUEST, details?: unknown) {
    super(HttpStatus.BAD_REQUEST, { code, message, details });
  }
}

export class UnauthorizedAppException extends AppException {
  constructor(message = 'Authentication required.', code: ErrorCodeValue = ErrorCode.UNAUTHORIZED) {
    super(HttpStatus.UNAUTHORIZED, { code, message });
  }
}

export class ForbiddenAppException extends AppException {
  constructor(message = 'You do not have access to this resource.', code: ErrorCodeValue = ErrorCode.FORBIDDEN) {
    super(HttpStatus.FORBIDDEN, { code, message });
  }
}

export class NotFoundAppException extends AppException {
  /**
   * Note: for tenant-scoped resources we deliberately return 404 (not 403) when
   * the caller is not a member, so resource existence is not disclosed.
   */
  constructor(resource: string, id?: string) {
    super(HttpStatus.NOT_FOUND, {
      code: ErrorCode.NOT_FOUND,
      message: id ? `${resource} "${id}" was not found.` : `${resource} was not found.`,
    });
  }
}

export class ConflictAppException extends AppException {
  constructor(message: string, code: ErrorCodeValue = ErrorCode.CONFLICT, details?: unknown) {
    super(HttpStatus.CONFLICT, { code, message, details });
  }
}

export class NotImplementedAppException extends AppException {
  constructor(message: string, details?: unknown) {
    super(HttpStatus.NOT_IMPLEMENTED, {
      code: ErrorCode.NOT_IMPLEMENTED,
      message,
      details,
    });
  }
}

export class ServiceUnavailableAppException extends AppException {
  constructor(
    message: string,
    code: ErrorCodeValue = ErrorCode.SERVICE_UNAVAILABLE,
    details?: unknown,
  ) {
    super(HttpStatus.SERVICE_UNAVAILABLE, { code, message, details });
  }
}

/**
 * Thrown when a database-backed route is invoked while DATABASE_URL is not
 * configured or the connection is down. Surfaces as 503 with a code clients can
 * retry on, instead of an opaque 500.
 */
export class DatabaseUnavailableException extends ServiceUnavailableAppException {
  constructor(detail?: string) {
    super(
      'The database is not available. This endpoint requires a configured, reachable DATABASE_URL.',
      ErrorCode.DATABASE_UNAVAILABLE,
      detail ? { detail } : undefined,
    );
  }
}
