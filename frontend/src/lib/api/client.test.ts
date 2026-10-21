import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { ApiError, apiRequest, clearSessionTokens, setUnauthorizedHandler, storeTokens } from "./client.ts";

const nativeFetch = globalThis.fetch;
const nativeWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const session = new Map<string, string>();
function installFakeWindow() {
  session.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage: {
    getItem: (key: string) => session.get(key) ?? null,
    setItem: (key: string, value: string) => { session.set(key, value); },
    removeItem: (key: string) => { session.delete(key); },
    } },
  });
}

beforeEach(installFakeWindow);

afterEach(() => {
  globalThis.fetch = nativeFetch;
  setUnauthorizedHandler(null);
  session.clear();
  clearSessionTokens();
  if (nativeWindow) Object.defineProperty(globalThis, "window", nativeWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

test("unwraps the backend success envelope", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: { count: 4 }, meta: { requestId: "r", timestamp: "t" } }), { status: 200 });
  assert.deepEqual(await apiRequest<{ count: number }>("/health/live", { auth: false }), { count: 4 });
});

test("exposes safe API error code and message", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "Request validation failed." } }), { status: 400 });
  await assert.rejects(apiRequest("/auth/login", { method: "POST", auth: false, body: {} }), (error: unknown) => error instanceof ApiError && error.status === 400 && error.code === "VALIDATION_ERROR");
});

test("coalesces concurrent unauthorized requests into one refresh", async () => {
  storeTokens({ accessToken: "old-access", refreshToken: "refresh-1", tokenType: "Bearer", expiresIn: 60, refreshTokenExpiresAt: "later" });
  let refreshCount = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/refresh")) {
      refreshCount += 1;
      await Promise.resolve();
      return new Response(JSON.stringify({ success: true, data: { tokens: { accessToken: "new-access", refreshToken: "refresh-2", tokenType: "Bearer", expiresIn: 60, refreshTokenExpiresAt: "later" } }, meta: {} }), { status: 200 });
    }
    const auth = new Headers(init?.headers).get("Authorization");
    if (auth === "Bearer old-access") return new Response(JSON.stringify({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }), { status: 401 });
    return new Response(JSON.stringify({ success: true, data: { ok: true }, meta: {} }), { status: 200 });
  };
  const [first, second] = await Promise.all([apiRequest<{ ok: boolean }>("/one"), apiRequest<{ ok: boolean }>("/two")]);
  assert.deepEqual(first, { ok: true });
  assert.deepEqual(second, { ok: true });
  assert.equal(refreshCount, 1);
  assert.equal(session.get("aclp.refresh-token.v1"), "refresh-2");
});

test("clears a failed refresh session and does not retry protected calls forever", async () => {
  storeTokens({ accessToken: "expired", refreshToken: "invalid-refresh", tokenType: "Bearer", expiresIn: 1, refreshTokenExpiresAt: "past" });
  let protectedCalls = 0;
  let refreshCalls = 0;
  let unauthorizedCalls = 0;
  setUnauthorizedHandler(() => { unauthorizedCalls += 1; });
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/auth/refresh")) refreshCalls += 1;
    else protectedCalls += 1;
    return new Response(JSON.stringify({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }), { status: 401 });
  };
  await assert.rejects(apiRequest("/private"), (error: unknown) => error instanceof ApiError && error.status === 401);
  assert.equal(protectedCalls, 1);
  assert.equal(refreshCalls, 1);
  assert.equal(unauthorizedCalls, 1);
  assert.equal(session.has("aclp.refresh-token.v1"), false);
});
