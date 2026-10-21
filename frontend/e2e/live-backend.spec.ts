import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

const API = process.env.ACLP_LIVE_API_BASE_URL ?? "http://127.0.0.1:3000/api/v1";
const PASSWORD = `Live-Test-${randomUUID()}-A2`;

interface Envelope<T> {
  success: boolean;
  data: T;
}

async function api<T>(
  path: string,
  options: {
    method?: string;
    token?: string;
    apiKey?: string;
    body?: unknown;
    expectedStatus?: number;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.apiKey) headers["x-api-key"] = options.apiKey;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${API}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  expect(response.status, `${options.method ?? "GET"} ${path}`).toBe(options.expectedStatus ?? 200);
  if (!response.ok) return undefined as T;
  const envelope = (await response.json()) as Envelope<T>;
  expect(envelope.success).toBe(true);
  return envelope.data;
}

test("live PostgreSQL-backed APIs, auth, ingestion, findings, and workspace isolation", async ({ page }) => {
  test.skip(process.env.ACLP_LIVE_INTEGRATION !== "1", "Requires the isolated live PostgreSQL and backend services.");

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const email = `live-${suffix}@example.test`;
  const otherEmail = `other-${suffix}@example.test`;
  const registered = await api<{
    user: { id: string };
    tokens: { accessToken: string; refreshToken: string };
    organization: { id: string; name: string };
  }>("/auth/register", {
    method: "POST",
    expectedStatus: 201,
    body: { email, name: "Live Integration User", password: PASSWORD, organizationName: `Live Workspace A ${suffix}` },
  });
  const organizationA = registered.organization;
  const accessA = registered.tokens.accessToken;
  const refreshA = registered.tokens.refreshToken;

  const current = await api<{ user: { id: string }; organizations: Array<{ id: string }> }>("/auth/me", { token: accessA });
  expect(current.user.id).toBe(registered.user.id);
  expect(current.organizations.map((org) => org.id)).toContain(organizationA.id);

  const rotated = await api<{ tokens: { accessToken: string; refreshToken: string } }>("/auth/refresh", {
    method: "POST",
    body: { refreshToken: refreshA },
  });
  await api("/auth/refresh", { method: "POST", body: { refreshToken: refreshA }, expectedStatus: 401 });
  await api("/auth/logout", {
    method: "POST",
    token: rotated.tokens.accessToken,
    body: { refreshToken: rotated.tokens.refreshToken },
  });
  await api("/auth/refresh", { method: "POST", body: { refreshToken: rotated.tokens.refreshToken }, expectedStatus: 401 });

  const login = await api<{ tokens: { accessToken: string } }>("/auth/login", {
    method: "POST",
    body: { email, password: PASSWORD },
  });
  const access = login.tokens.accessToken;
  const organizationB = await api<{ id: string; name: string }>("/organizations", {
    method: "POST",
    token: access,
    expectedStatus: 201,
    body: { name: `Live Workspace B ${suffix}` },
  });

  async function createProject(organizationId: string, name: string) {
    return api<{ id: string; name: string }>(`/organizations/${organizationId}/projects`, {
      method: "POST",
      token: access,
      expectedStatus: 201,
      body: { name, environment: "DEVELOPMENT" },
    });
  }
  const projectA = await createProject(organizationA.id, `Live Project A ${suffix}`);
  const projectB = await createProject(organizationB.id, `Live Project B ${suffix}`);

  async function createIngestionKey(projectId: string) {
    return api<{ rawKey: string }>(`/projects/${projectId}/api-keys`, {
      method: "POST",
      token: access,
      expectedStatus: 201,
      body: { name: `Live test ${suffix}`, scopes: ["USAGE_WRITE"] },
    });
  }
  const keyA = (await createIngestionKey(projectA.id)).rawKey;
  const keyB = (await createIngestionKey(projectB.id)).rawKey;
  const promptHash = "a".repeat(64);

  async function ingest(apiKey: string, eventId: string, tokens: number, hash?: string) {
    return api<{ status: string; usageRecordId: string }>("/ingest/usage", {
      method: "POST",
      apiKey,
      expectedStatus: 201,
      body: {
        eventId,
        provider: "OPENAI",
        model: "gpt-4o-mini-live-test",
        occurredAt: new Date().toISOString(),
        inputTokens: tokens,
        outputTokens: 20,
        totalTokens: tokens + 20,
        status: "SUCCESS",
        promptHash: hash ?? null,
      },
    });
  }
  const eventA1 = await ingest(keyA, `live-${suffix}-a1`, 100, promptHash);
  const eventA2 = await ingest(keyA, `live-${suffix}-a2`, 110, promptHash);
  const eventB1 = await ingest(keyB, `live-${suffix}-b1`, 10);
  expect([eventA1.status, eventA2.status, eventB1.status]).toEqual(["accepted", "accepted", "accepted"]);

  const duplicate = await api<{ status: string }>("/ingest/usage", {
    method: "POST",
    apiKey: keyA,
    expectedStatus: 201,
    body: {
      eventId: `live-${suffix}-a1`, provider: "OPENAI", model: "gpt-4o-mini-live-test",
      occurredAt: new Date().toISOString(), inputTokens: 100, outputTokens: 20, totalTokens: 120,
      status: "SUCCESS", promptHash,
    },
  });
  expect(duplicate.status).toBe("duplicate");

  const from = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const usage = await api<{ items: Array<{ id: string }>; pagination: { totalItems: number } }>(
    `/organizations/${organizationA.id}/usage?projectId=${projectA.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&provider=OPENAI&model=gpt-4o-mini-live-test&status=SUCCESS&page=1&limit=1`,
    { token: access },
  );
  expect(usage.items).toHaveLength(1);
  expect(usage.pagination.totalItems).toBe(2);

  const overview = await api<{ totalEvents: number; totalTokens: number }>(
    `/organizations/${organizationA.id}/reports/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&projectId=${projectA.id}`,
    { token: access },
  );
  expect(overview.totalEvents).toBe(2);
  expect(overview.totalTokens).toBe(250);
  await api(`/organizations/${organizationA.id}/usage/timeseries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&projectId=${projectA.id}&granularity=day`, { token: access });
  await api(`/organizations/${organizationA.id}/reports/cost?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&projectId=${projectA.id}`, { token: access });
  await api(`/organizations/${organizationA.id}/reports/usage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&projectId=${projectA.id}`, { token: access });
  await api(`/organizations/${organizationA.id}/reports/detections?projectId=${projectA.id}`, { token: access });
  await api(`/organizations/${organizationA.id}/projects`, { token: access });
  await api(`/organizations/${organizationA.id}`, { token: access });
  await api(`/organizations/${organizationA.id}/members`, { token: access });
  const detectors = await api<Array<{ type: string }>>(`/organizations/${organizationA.id}/detection/detectors`, { token: access });
  expect(detectors.some((detector) => detector.type === "DUPLICATE_PROMPT")).toBe(true);

  const run = await api<{ id: string }>(`/organizations/${organizationA.id}/detection/runs`, {
    method: "POST",
    token: access,
    expectedStatus: 201,
    body: {
      detectorType: "DUPLICATE_PROMPT", projectId: projectA.id,
      windowStart: from, windowEnd: to,
    },
  });
  let runStatus = "PENDING";
  for (let attempt = 0; attempt < 40 && !["COMPLETED", "FAILED"].includes(runStatus); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const result = await api<{ status: string }>(`/organizations/${organizationA.id}/detection/runs/${run.id}`, { token: access });
    runStatus = result.status;
  }
  expect(runStatus).toBe("COMPLETED");
  const findings = await api<{ items: Array<{ id: string; status: string; title: string }>; pagination: { totalItems: number } }>(
    `/organizations/${organizationA.id}/detection/findings?projectId=${projectA.id}&page=1&limit=10`,
    { token: access },
  );
  expect(findings.pagination.totalItems).toBeGreaterThan(0);
  const finding = findings.items[0];
  await api(`/organizations/${organizationA.id}/detection/findings/${finding.id}`, { token: access });
  await api(`/organizations/${organizationA.id}/alerts?projectId=${projectA.id}`, { token: access });

  const outsiderRegistration = await api<{ tokens: { accessToken: string } }>("/auth/register", {
    method: "POST",
    expectedStatus: 201,
    body: { email: otherEmail, name: "Live Isolated User", password: PASSWORD, organizationName: `Isolated ${suffix}` },
  });
  const outsiderToken = outsiderRegistration.tokens.accessToken;
  await api(`/organizations/${organizationA.id}/usage`, { token: outsiderToken, expectedStatus: 404 });
  await api(`/organizations/${organizationA.id}/usage/${eventA1.usageRecordId}`, { token: outsiderToken, expectedStatus: 404 });
  await api(`/organizations/${organizationA.id}/reports/overview`, { token: outsiderToken, expectedStatus: 404 });
  await api(`/organizations/${organizationA.id}/detection/findings`, { token: outsiderToken, expectedStatus: 404 });
  await api(`/organizations/${organizationA.id}/detection/findings/${finding.id}`, { token: outsiderToken, expectedStatus: 404 });
  await api(`/organizations/${organizationA.id}/detection/findings/${finding.id}/status`, {
    method: "PATCH", token: outsiderToken, expectedStatus: 404, body: { status: "RESOLVED" },
  });
  await api(`/organizations/${organizationA.id}/alerts`, { token: outsiderToken, expectedStatus: 404 });
  await api(`/projects/${projectA.id}`, { token: outsiderToken, expectedStatus: 404 });
  await api("/auth/me", { expectedStatus: 401 });

  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  const orgSelect = page.getByRole("combobox", { name: "Select organization" });
  await orgSelect.click();
  await page.getByRole("option", { name: organizationA.name }).click();
  await expect(page.getByText("Requests", { exact: true }).locator("..").getByText("2", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Usage explorer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Usage explorer" })).toBeVisible();
  await expect(page.getByText("gpt-4o-mini-live-test", { exact: false }).first()).toBeVisible();
  await page.getByLabel("Status").selectOption("SUCCESS");
  await expect(page.getByText("2 records · page 1 of 1")).toBeVisible();

  await page.getByRole("link", { name: "Leak detection", exact: true }).click();
  await expect(page.getByText(finding.title, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByText(/DUPLICATE_PROMPT · ACKNOWLEDGED/)).toBeVisible();
  const acknowledged = await api<{ status: string }>(`/organizations/${organizationA.id}/detection/findings/${finding.id}`, { token: access });
  expect(acknowledged.status).toBe("ACKNOWLEDGED");

  await page.getByRole("link", { name: "Alerts", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Alerts" })).toBeVisible();
  await expect(page.getByText("No alerts", { exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "Select organization" }).click();
  await page.getByRole("option", { name: organizationB.name }).click();
  await expect(page.getByText(`Live Project B ${suffix}`, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByText("Requests", { exact: true }).locator("..").getByText("1", { exact: true })).toBeVisible();
  await expect(page.getByText("2", { exact: true })).toHaveCount(0);
});
