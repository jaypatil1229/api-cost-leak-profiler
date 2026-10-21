import type { ApiEnvelope, ApiErrorEnvelope } from "./types";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1").replace(/\/$/, "");
const REFRESH_KEY = "aclp.refresh-token.v1";
let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
let unauthorizedHandler: (() => void) | null = null;

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export function clearSessionTokens() {
  accessToken = null;
  if (typeof window !== "undefined") window.sessionStorage.removeItem(REFRESH_KEY);
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  refreshTokenExpiresAt: string;
}

export function storeTokens(tokens: Tokens) {
  accessToken = tokens.accessToken;
  if (typeof window !== "undefined") window.sessionStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = body as ApiErrorEnvelope | null;
    throw new ApiError(
      error?.error?.message ?? `Request failed (${response.status}).`,
      response.status,
      error?.error?.code,
      error?.error?.details,
    );
  }
  if (body === null && response.status === 204) return undefined as T;
  if (!body || typeof body !== "object" || !("success" in body) || !("data" in body)) {
    throw new ApiError("The server returned an unexpected response.", response.status, "INVALID_RESPONSE");
  }
  const envelope = body as ApiEnvelope<T>;
  if (envelope.success !== true) throw new ApiError("The server rejected the request.", response.status);
  return envelope.data;
}

async function rotateTokens(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = window.sessionStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return null;
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await parseResponse<{ tokens: Tokens }>(response);
      storeTokens(data.tokens);
      return data.tokens.accessToken;
    } catch {
      clearSessionTokens();
      return null;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean;
  retryAuth?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, retryAuth = true, headers, body, ...init } = options;
  const requestHeaders = new Headers(headers);
  if (body !== undefined) requestHeaders.set("Content-Type", "application/json");
  if (auth && accessToken) requestHeaders.set("Authorization", `Bearer ${accessToken}`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Unable to reach the ACLP backend. Check the connection and retry.", 0, "NETWORK_ERROR");
  }

  if (response.status === 401 && auth && retryAuth && typeof window !== "undefined") {
    const token = await rotateTokens();
    if (token) return apiRequest<T>(path, { ...options, retryAuth: false });
    unauthorizedHandler?.();
  }
  return parseResponse<T>(response);
}

export function queryString(values: Record<string, string | number | null | undefined | boolean>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const refreshStoredSession = rotateTokens;
