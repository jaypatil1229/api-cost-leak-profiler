export type SdkErrorCode =
  | 'INVALID_EVENT'
  | 'QUEUE_FULL'
  | 'CLIENT_CLOSED'
  | 'REQUEST_TIMEOUT'
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'EVENT_REJECTED';

/** Safe diagnostic: messages never include request bodies, URLs, or credentials. */
export class AclpSdkError extends Error {
  readonly code: SdkErrorCode;
  readonly eventIds: string[];
  readonly httpStatus?: number;

  constructor(
    code: SdkErrorCode,
    message: string,
    options: { eventIds?: string[]; httpStatus?: number } = {},
  ) {
    super(message);
    this.name = 'AclpSdkError';
    this.code = code;
    this.eventIds = [...(options.eventIds ?? [])];
    this.httpStatus = options.httpStatus;
  }
}

export class QueueFullError extends AclpSdkError {
  constructor() {
    super('QUEUE_FULL', 'Telemetry queue is full; event was not enqueued.');
    this.name = 'QueueFullError';
  }
}
