import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Envelope metadata attached to every response. */
export class ResponseMetaDto {
  @ApiProperty({
    description: 'Correlation id. Echoed in the `x-request-id` response header.',
    example: '1f7b0b9e-5a4f-4a5e-9f0f-2f2a5d6c9c2b',
  })
  requestId!: string;

  @ApiProperty({
    description: 'Server time (UTC, ISO-8601) at which the response was produced.',
    example: '2026-01-15T09:30:00.000Z',
  })
  timestamp!: string;
}

/**
 * Standard success envelope.
 *
 * ```json
 * { "success": true, "data": { ... }, "meta": { "requestId": "…", "timestamp": "…" } }
 * ```
 */
export class ApiSuccessResponseDto<T = unknown> {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ description: 'Endpoint-specific payload.' })
  data!: T;

  @ApiProperty({ type: ResponseMetaDto })
  meta!: ResponseMetaDto;
}

export class ValidationIssueDto {
  @ApiProperty({ example: 'email', description: 'Dotted path of the offending property.' })
  field!: string;

  @ApiProperty({
    type: [String],
    example: ['email must be an email'],
    description: 'Human-readable messages for every failed constraint.',
  })
  messages!: string[];
}

export class ApiErrorDto {
  @ApiProperty({
    description: 'Stable machine-readable error code (see README "Error format").',
    example: 'VALIDATION_ERROR',
  })
  code!: string;

  @ApiProperty({
    description: 'Human-readable summary. Safe to display; never contains internals.',
    example: 'Request validation failed.',
  })
  message!: string;

  @ApiPropertyOptional({
    description: 'Structured context. For VALIDATION_ERROR this is a list of field issues.',
  })
  details?: unknown;
}

export class ApiErrorMetaDto extends ResponseMetaDto {
  @ApiProperty({ example: '/api/v1/auth/login' })
  path!: string;

  @ApiProperty({ example: 'POST' })
  method!: string;
}

/**
 * Standard error envelope. Stack traces and database internals are never
 * included, in any environment.
 */
export class ApiErrorResponseDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({ type: ApiErrorDto })
  error!: ApiErrorDto;

  @ApiProperty({ type: ApiErrorMetaDto })
  meta!: ApiErrorMetaDto;
}
