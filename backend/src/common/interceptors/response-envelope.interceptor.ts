import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';

import type { ApiSuccessResponseDto } from '../dto/api-response.dto';
import { normalizeForJson } from '../utils/serialization.util';

/**
 * Wraps every successful response in the standard envelope and normalises
 * values that do not serialise safely (Prisma `Decimal`, `BigInt`).
 *
 * Endpoints that must return a raw body (e.g. a future CSV export) should set
 * `@Header('content-type', ...)` and return a `StreamableFile`, which is passed
 * through untouched.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request & { id?: string }>();

    return next.handle().pipe(
      map((data: unknown): unknown => {
        if (isPassthrough(data)) {
          return data;
        }
        const body: ApiSuccessResponseDto = {
          success: true,
          data: normalizeForJson(data),
          meta: {
            requestId: request.id ?? 'unknown',
            timestamp: new Date().toISOString(),
          },
        };
        return body;
      }),
    );
  }
}

/** Streams and buffers must not be wrapped. */
function isPassthrough(data: unknown): boolean {
  if (data === null || typeof data !== 'object') {
    return false;
  }
  return (
    Buffer.isBuffer(data) ||
    typeof (data as { pipe?: unknown }).pipe === 'function' ||
    (data as { getStream?: unknown }).getStream !== undefined
  );
}
