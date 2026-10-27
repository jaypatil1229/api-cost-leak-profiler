import { applyDecorators, type Type } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

import {
  ApiErrorResponseDto,
  ApiSuccessResponseDto,
  ResponseMetaDto,
} from '../dto/api-response.dto';
import { PaginationMetaDto } from '../dto/pagination.dto';

type ModelType = Type<unknown>;

function envelopeSchema(model: ModelType | undefined, isArray = false): SchemaObject {
  const dataSchema: any = model
    ? isArray
      ? { type: 'array', items: { $ref: getSchemaPath(model) } }
      : { $ref: getSchemaPath(model) }
    : { type: 'object' };

  return {
    type: 'object',
    required: ['success', 'data', 'meta'],
    properties: {
      success: { type: 'boolean', example: true },
      data: dataSchema,
      meta: { $ref: getSchemaPath(ResponseMetaDto) },
    },
  };
}

function paginatedEnvelopeSchema(model: ModelType): SchemaObject {
  return {
    type: 'object',
    required: ['success', 'data', 'meta'],
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        required: ['items', 'pagination'],
        properties: {
          items: { type: 'array', items: { $ref: getSchemaPath(model) } },
          pagination: { $ref: getSchemaPath(PaginationMetaDto) },
        },
      },
      meta: { $ref: getSchemaPath(ResponseMetaDto) },
    },
  };
}

/** Documents a 200 response wrapped in the standard success envelope. */
export function ApiOkEnvelope(
  model?: ModelType,
  options?: { isArray?: boolean; description?: string },
) {
  const extras = model ? [model] : [];
  return applyDecorators(
    ApiExtraModels(ApiSuccessResponseDto, ResponseMetaDto, ...extras),
    ApiOkResponse({
      description: options?.description,
      schema: envelopeSchema(model, options?.isArray ?? false),
    }),
  );
}

/** Documents a 201 response wrapped in the standard success envelope. */
export function ApiCreatedEnvelope(model?: ModelType, description?: string) {
  const extras = model ? [model] : [];
  return applyDecorators(
    ApiExtraModels(ApiSuccessResponseDto, ResponseMetaDto, ...extras),
    ApiCreatedResponse({ description, schema: envelopeSchema(model) }),
  );
}

/** Documents a 200 response whose `data` is `{ items, pagination }`. */
export function ApiPaginatedEnvelope(model: ModelType, description?: string) {
  return applyDecorators(
    ApiExtraModels(ApiSuccessResponseDto, ResponseMetaDto, PaginationMetaDto, model),
    ApiOkResponse({ description, schema: paginatedEnvelopeSchema(model) }),
  );
}

/**
 * Attaches the error responses that essentially every authenticated endpoint can
 * produce, so they are documented once instead of repeated per route.
 */
export function ApiStandardErrors(options?: { auth?: boolean; notFound?: boolean }) {
  const decorators = [
    ApiExtraModels(ApiErrorResponseDto),
    ApiResponse({ status: 400, description: 'Validation failed.', type: ApiErrorResponseDto }),
    ApiResponse({ status: 429, description: 'Rate limit exceeded.', type: ApiErrorResponseDto }),
    ApiResponse({ status: 500, description: 'Unexpected error.', type: ApiErrorResponseDto }),
    ApiResponse({
      status: 503,
      description: 'Database or a dependency is unavailable.',
      type: ApiErrorResponseDto,
    }),
  ];

  if (options?.auth !== false) {
    decorators.push(
      ApiResponse({
        status: 401,
        description: 'Missing, expired or invalid credentials.',
        type: ApiErrorResponseDto,
      }),
      ApiResponse({
        status: 403,
        description: 'Authenticated but not authorized for this resource.',
        type: ApiErrorResponseDto,
      }),
    );
  }
  if (options?.notFound) {
    decorators.push(
      ApiResponse({ status: 404, description: 'Resource not found.', type: ApiErrorResponseDto }),
    );
  }

  return applyDecorators(...decorators);
}
