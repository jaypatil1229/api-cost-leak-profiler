import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

import { ErrorCode } from '../constants/error-codes';
import type { ValidationIssueDto } from '../dto/api-response.dto';

/**
 * Flattens class-validator errors, including nested objects and arrays, into
 * `field` / `messages` pairs. Array indices are preserved (`events.3.model`) so
 * a batch ingestion caller can pinpoint the offending event.
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ValidationIssueDto[] {
  const issues: ValidationIssueDto[] = [];

  for (const error of errors) {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;

    const messages = Object.values(error.constraints ?? {});
    if (messages.length > 0) {
      issues.push({ field: path, messages });
    }
    if (error.children && error.children.length > 0) {
      issues.push(...flattenValidationErrors(error.children, path));
    }
  }

  return issues;
}

/**
 * Global request validation.
 *
 *  * `whitelist` + `forbidNonWhitelisted` — unknown properties are an error, not
 *    silently dropped, so typos in SDK payloads surface immediately.
 *  * `enableImplicitConversion: false` — DTOs declare their own `@Type(...)`
 *    conversions. Implicit conversion silently turns `"abc"` into `NaN`, which
 *    is worse than a validation failure.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    validateCustomDecorators: true,
    stopAtFirstError: false,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors: ValidationError[]) =>
      new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed.',
        details: flattenValidationErrors(errors),
      }),
  });
}
