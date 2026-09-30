import { randomUUID } from 'node:crypto';

import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Params as PinoParams } from 'nestjs-pino';

import { API_PREFIX, REQUEST_ID_HEADER } from '../common/constants/app.constants';
import type { RequestContext } from '../common/types/request-context';

import type { Configuration } from './configuration';

/**
 * Header allowlist. Everything else is dropped before it reaches a log sink, so
 * a newly introduced credential header cannot leak by default.
 */
const LOGGED_REQUEST_HEADERS = ['user-agent', 'content-type', 'content-length', 'referer'] as const;

/**
 * Secondary defence: even if a serializer is changed, these paths are censored.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["proxy-authorization"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.currentPassword',
  '*.newPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',
  '*.secret',
  'req.body.password',
  'req.body.token',
  'req.body.refreshToken',
];

/** Routes excluded from automatic request logging (probe noise). */
const AUTO_LOGGING_IGNORED_PATHS = new Set([
  `/${API_PREFIX}/health/live`,
  `/${API_PREFIX}/health/ready`,
]);

const MAX_REQUEST_ID_LENGTH = 64;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]+$/;

/**
 * Builds the nestjs-pino configuration.
 *
 * Design notes
 *  * Request ids are accepted from an upstream proxy when they look safe, and
 *    generated otherwise. They are echoed in the response header and included
 *    in every log line and error body.
 *  * No request or response bodies are logged. Usage payloads may contain
 *    customer identifiers, and prompt hashes are not worth the exposure.
 */
export function buildLoggerParams(config: Configuration): PinoParams {
  return {
    pinoHttp: {
      level: config.logging.level,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const incoming = req.headers[REQUEST_ID_HEADER];
        const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
        const requestId =
          typeof candidate === 'string' &&
          candidate.length > 0 &&
          candidate.length <= MAX_REQUEST_ID_LENGTH &&
          SAFE_REQUEST_ID.test(candidate)
            ? candidate
            : randomUUID();
        res.setHeader(REQUEST_ID_HEADER, requestId);
        return requestId;
      },
      autoLogging: {
        ignore: (req: IncomingMessage) => {
          const url = (req.url ?? '').split('?')[0];
          return AUTO_LOGGING_IGNORED_PATHS.has(url);
        },
      },
      customProps: (req: IncomingMessage) => {
        const ctx = req as unknown as RequestContext;
        return {
          userId: ctx.user?.id,
          organizationId: ctx.orgContext?.organizationId ?? ctx.apiKeyContext?.organizationId,
          projectId: ctx.projectContext?.projectId ?? ctx.apiKeyContext?.projectId,
          // Only the public key prefix — never the secret.
          apiKeyPrefix: ctx.apiKeyContext?.keyPrefix,
        };
      },
      serializers: {
        req: (req: IncomingMessage & { id?: string; url?: string; method?: string }) => ({
          id: req.id,
          method: req.method,
          url: typeof req.url === 'string' ? req.url.split('?')[0] : undefined,
          headers: pickHeaders(req.headers),
        }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
        err: (err: Error & { code?: string; status?: number }) => ({
          type: err.name,
          message: err.message,
          code: err.code,
          status: err.status,
          // Stacks stay in logs (never in API responses).
          stack: err.stack,
        }),
      },
      transport: config.logging.pretty
        ? {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              colorize: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    },
    // Query strings can carry customer identifiers; keep them out of the
    // auto-generated log message.
    exclude: [],
  };
}

function pickHeaders(headers: IncomingMessage['headers']): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of LOGGED_REQUEST_HEADERS) {
    if (headers[name] !== undefined) {
      out[name] = headers[name];
    }
  }
  return out;
}
