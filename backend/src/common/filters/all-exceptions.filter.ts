import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

import { ErrorCode, type ErrorCodeValue } from '../constants/error-codes';
import { APP_CONFIG } from '../../config/config.module';
import type { Configuration } from '../../config/configuration';
import {
  isConnectionError,
  PrismaErrorCode,
  uniqueConstraintFields,
} from '../../database/prisma-error.util';
import type { ApiErrorResponseDto } from '../dto/api-response.dto';

interface NormalizedError {
  status: number;
  code: ErrorCodeValue;
  message: string;
  details?: unknown;
  /** Logged, never returned. */
  internal?: unknown;
}

/**
 * Single exit point for every error leaving the API.
 *
 * Guarantees:
 *  * one response shape, always (`success` / `error` / `meta`);
 *  * a stable `error.code` clients can branch on;
 *  * no stack traces, SQL, Prisma internals or secrets in the body — those go
 *    to the structured log with the same `requestId` for correlation.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(@Inject(APP_CONFIG) private readonly config: Configuration) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    const normalized = this.normalize(exception);

    this.log(normalized, exception, request);

    const body: ApiErrorResponseDto = {
      success: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details === undefined ? {} : { details: normalized.details }),
      },
      meta: {
        requestId: request.id ?? 'unknown',
        timestamp: new Date().toISOString(),
        path: request.originalUrl?.split('?')[0] ?? request.url,
        method: request.method,
      },
    };

    if (response.headersSent) {
      return;
    }
    response.status(normalized.status).json(body);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaKnownError(exception);
    }
    if (
      exception instanceof Prisma.PrismaClientInitializationError ||
      isConnectionError(exception)
    ) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: ErrorCode.DATABASE_UNAVAILABLE,
        message:
          'The database is not available. This endpoint requires a configured, reachable DATABASE_URL.',
        internal: exception,
      };
    }
    if (exception instanceof Prisma.PrismaClientValidationError) {
      // A malformed query is our bug, not the caller's — do not echo it back.
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: ErrorCode.INTERNAL_ERROR,
        message: 'An unexpected error occurred while processing the request.',
        internal: exception,
      };
    }

    // body-parser and other Express middleware throw plain errors carrying a status.
    const httpish = exception as { status?: number; statusCode?: number; type?: string };
    const status = httpish?.status ?? httpish?.statusCode;
    if (typeof status === 'number' && status >= 400 && status < 600) {
      if (status === HttpStatus.PAYLOAD_TOO_LARGE || httpish.type === 'entity.too.large') {
        return {
          status: HttpStatus.PAYLOAD_TOO_LARGE,
          code: ErrorCode.PAYLOAD_TOO_LARGE,
          message: 'Request body exceeds the configured size limit.',
          internal: exception,
        };
      }
      if (httpish.type === 'entity.parse.failed') {
        return {
          status: HttpStatus.BAD_REQUEST,
          code: ErrorCode.BAD_REQUEST,
          message: 'Request body is not valid JSON.',
        };
      }
      return {
        status,
        code: codeForStatus(status),
        message: 'The request could not be processed.',
        internal: exception,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred while processing the request.',
      internal: exception,
    };
  }

  private fromHttpException(exception: HttpException): NormalizedError {
    const status = exception.getStatus();
    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return { status, code: codeForStatus(status), message: payload };
    }

    const record = payload as Record<string, unknown>;

    // Thrown by AppException and by the validation pipe's exception factory.
    if (typeof record.code === 'string' && typeof record.message === 'string') {
      return {
        status,
        code: record.code as ErrorCodeValue,
        message: record.message,
        details: record.details,
      };
    }

    // Default Nest shape: { statusCode, message: string | string[], error }.
    const rawMessage = record.message;
    if (Array.isArray(rawMessage)) {
      return {
        status,
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed.',
        details: rawMessage,
      };
    }

    return {
      status,
      code: codeForStatus(status),
      message: typeof rawMessage === 'string' ? rawMessage : exception.message,
    };
  }

  private fromPrismaKnownError(exception: Prisma.PrismaClientKnownRequestError): NormalizedError {
    switch (exception.code) {
      case PrismaErrorCode.UNIQUE_CONSTRAINT: {
        const fields = uniqueConstraintFields(exception);
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.CONFLICT,
          message:
            fields.length > 0
              ? `A record with the same ${fields.join(', ')} already exists.`
              : 'A record with the same unique value already exists.',
          details: fields.length > 0 ? { fields } : undefined,
        };
      }
      case PrismaErrorCode.RECORD_NOT_FOUND:
      case PrismaErrorCode.DEPENDS_ON_MISSING_RECORD:
        return {
          status: HttpStatus.NOT_FOUND,
          code: ErrorCode.NOT_FOUND,
          message: 'The requested resource was not found.',
        };
      case PrismaErrorCode.FOREIGN_KEY_CONSTRAINT:
        return {
          status: HttpStatus.BAD_REQUEST,
          code: ErrorCode.BAD_REQUEST,
          message: 'The request references a resource that does not exist.',
        };
      case PrismaErrorCode.VALUE_TOO_LONG:
        return {
          status: HttpStatus.BAD_REQUEST,
          code: ErrorCode.VALIDATION_ERROR,
          message: 'One of the supplied values is too long.',
        };
      case PrismaErrorCode.TRANSACTION_CONFLICT:
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.CONFLICT,
          message: 'The operation conflicted with a concurrent change. Please retry.',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: ErrorCode.INTERNAL_ERROR,
          message: 'An unexpected database error occurred.',
          internal: exception,
        };
    }
  }

  private log(normalized: NormalizedError, exception: unknown, request: Request & { id?: string }) {
    const context = {
      requestId: request.id,
      method: request.method,
      path: request.originalUrl?.split('?')[0] ?? request.url,
      status: normalized.status,
      code: normalized.code,
    };

    if (normalized.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${normalized.code} ${JSON.stringify(context)}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      return;
    }

    // 4xx is routine; keep it at debug unless we are developing.
    const message = `${normalized.code} ${JSON.stringify(context)}`;
    if (this.config.app.isProduction) {
      this.logger.debug(message);
    } else {
      this.logger.warn(message);
    }
  }
}

function codeForStatus(status: number): ErrorCodeValue {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ErrorCode.BAD_REQUEST;
    case HttpStatus.UNAUTHORIZED:
      return ErrorCode.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return ErrorCode.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ErrorCode.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ErrorCode.CONFLICT;
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return ErrorCode.PAYLOAD_TOO_LARGE;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ErrorCode.RATE_LIMITED;
    case HttpStatus.NOT_IMPLEMENTED:
      return ErrorCode.NOT_IMPLEMENTED;
    case HttpStatus.SERVICE_UNAVAILABLE:
      return ErrorCode.SERVICE_UNAVAILABLE;
    default:
      return status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST;
  }
}
