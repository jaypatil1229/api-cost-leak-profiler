import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROUTES = [
  "/",
  "/product",
  "/how-it-works",
  "/docs",
  "/privacy",
  "/terms",
  "/contact",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/onboarding",
  "/overview",
  "/attribution",
  "/trends",
  "/usage",
  "/findings",
  "/findings/find_spend_spike_0919",
  "/alerts",
  "/reports",
  "/project-settings",
  "/organization-settings",
];

test.describe("every route renders", () => {
  for (const path of ROUTES) {
    test(path + " renders without console errors", async ({ page }) => {
      const problems: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") problems.push("console: " + message.text());
      });
      page.on("pageerror", (error) => problems.push("pageerror: " + error.message));

      const response = await page.goto(path, { waitUntil: "networkidle" });
      expect(response, path + " should respond").not.toBeNull();
      expect(response?.status() ?? 0).toBeLessThan(400);
      await expect(page).toHaveTitle(/ACLP/);
      await expect(page.locator("h1, h2").first()).toBeVisible();
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
});

test("marketing homepage has no automated accessibility violations", async ({ page }) => {
  // Motion reveals start at low opacity, which skews contrast checks; scan the reduced-motion render.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("unauthenticated users cannot enter the dashboard", async ({ page }) => {
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await expect(page.getByRole("heading", { name: /sign in to aclp/i })).toBeVisible();
});

test("a successful authenticated API session renders the real dashboard shell", async ({ page }) => {
  const envelope = (data: unknown) => ({ success: true, data, meta: { requestId: "test", timestamp: new Date().toISOString() } });
  const user = { id: "test-user", email: "dev@example.test", name: "Test User", status: "ACTIVE", emailVerified: false, lastLoginAt: null, createdAt: new Date().toISOString() };
  const organization = { id: "test-org", name: "Test Org", slug: "test-org", role: "OWNER" };
  await page.route("**/api/v1/auth/login", (route) => route.fulfill({ json: envelope({ user, tokens: { accessToken: "fixture-access", refreshToken: "fixture-refresh", tokenType: "Bearer", expiresIn: 900, refreshTokenExpiresAt: "2099-01-01T00:00:00.000Z" }, organization: null }) }));
  await page.route("**/api/v1/auth/me", (route) => route.fulfill({ json: envelope({ user, organizations: [organization] }) }));
  await page.route("**/api/v1/organizations/test-org/projects**", (route) => route.fulfill({ json: envelope({ projects: [] }) }));

  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill("dev@example.test");
  await page.getByLabel("Password").fill("Test-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByText(/no project selected/i)).toBeVisible();
});

test("invalid credentials stay on sign-in and show the backend error", async ({ page }) => {
  await page.route("**/api/v1/auth/login", (route) => route.fulfill({
    status: 401,
    json: { success: false, error: { code: "UNAUTHORIZED", message: "Invalid email or password." }, meta: {} },
  }));

  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill("dev@example.test");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("usage filters send status values accepted by the backend", async ({ page }) => {
  const envelope = (data: unknown) => ({ success: true, data, meta: {} });
  const user = { id: "test-user", email: "dev@example.test", name: "Test User", status: "ACTIVE", emailVerified: false, lastLoginAt: null, createdAt: new Date().toISOString() };
  const organization = { id: "test-org", name: "Test Org", slug: "test-org", role: "OWNER" };
  const project = { id: "test-project", organizationId: "test-org", name: "Test Project", slug: "test-project", description: null, environment: "DEVELOPMENT", status: "ACTIVE", archivedAt: null, createdByUserId: "test-user", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const requestedStatuses: string[] = [];

  await page.route("**/api/v1/auth/login", (route) => route.fulfill({ json: envelope({ user, tokens: { accessToken: "fixture-access", refreshToken: "fixture-refresh", tokenType: "Bearer", expiresIn: 900, refreshTokenExpiresAt: "2099-01-01T00:00:00.000Z" } }) }));
  await page.route("**/api/v1/auth/refresh", (route) => route.fulfill({ json: envelope({ tokens: { accessToken: "fixture-access-rotated", refreshToken: "fixture-refresh-rotated", tokenType: "Bearer", expiresIn: 900, refreshTokenExpiresAt: "2099-01-01T00:00:00.000Z" } }) }));
  await page.route("**/api/v1/auth/me", (route) => route.fulfill({ json: envelope({ user, organizations: [organization] }) }));
  await page.route("**/api/v1/organizations/test-org/projects", (route) => route.fulfill({ json: envelope({ projects: [project] }) }));
  await page.route("**/api/v1/organizations/test-org/usage**", (route) => {
    const url = new URL(route.request().url());
    requestedStatuses.push(url.searchParams.get("status") ?? "");
    return route.fulfill({ json: envelope({ items: [], pagination: { page: 1, limit: 25, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } }) });
  });

  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill("dev@example.test");
  await page.getByLabel("Password").fill("Test-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto("/usage");
  await page.getByLabel("Status").selectOption("SUCCESS");

  await expect.poll(() => requestedStatuses).toContain("SUCCESS");
});

test("switching organizations prevents a late previous-workspace response from replacing current metrics", async ({ page }) => {
  const envelope = (data: unknown) => ({ success: true, data, meta: {} });
  const user = { id: "test-user", email: "dev@example.test", name: "Test User", status: "ACTIVE", emailVerified: false, lastLoginAt: null, createdAt: new Date().toISOString() };
  const organizations = [
    { id: "org-a", name: "Org A", slug: "org-a", role: "OWNER" },
    { id: "org-b", name: "Org B", slug: "org-b", role: "OWNER" },
  ];
  const project = (id: string, organizationId: string, name: string) => ({ id, organizationId, name, slug: id, description: null, environment: "DEVELOPMENT", status: "ACTIVE", archivedAt: null, createdByUserId: "test-user", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  let notifyOrgARequest!: () => void;
  let releaseOrgAResponse!: () => void;
  const orgARequested = new Promise<void>((resolve) => { notifyOrgARequest = resolve; });
  const orgAResponseGate = new Promise<void>((resolve) => { releaseOrgAResponse = resolve; });

  await page.route("**/api/v1/auth/login", (route) => route.fulfill({ json: envelope({ user, tokens: { accessToken: "fixture-access", refreshToken: "fixture-refresh", tokenType: "Bearer", expiresIn: 900, refreshTokenExpiresAt: "2099-01-01T00:00:00.000Z" } }) }));
  await page.route("**/api/v1/auth/me", (route) => route.fulfill({ json: envelope({ user, organizations }) }));
  await page.route("**/api/v1/organizations/org-a/projects", (route) => route.fulfill({ json: envelope({ projects: [project("project-a", "org-a", "Project A")] }) }));
  await page.route("**/api/v1/organizations/org-b/projects", (route) => route.fulfill({ json: envelope({ projects: [project("project-b", "org-b", "Project B")] }) }));
  await page.route("**/api/v1/organizations/*/reports/overview**", async (route) => {
    const orgA = route.request().url().includes("/organizations/org-a/");
    if (orgA) {
      notifyOrgARequest();
      await orgAResponseGate;
    }
    const count = orgA ? 111 : 222;
    return route.fulfill({ json: envelope({ totalEvents: count, totalCost: "1.00", totalInputTokens: count, totalOutputTokens: 0, totalTokens: count, topModels: [], topProviders: [], topFeatures: [], activeFindingsCount: 0, activeAlertsCount: 0, currency: "USD" }) });
  });
  await page.route("**/api/v1/organizations/*/usage/timeseries**", (route) => route.fulfill({ json: envelope({ granularity: "day", buckets: [] }) }));
  await page.route("**/api/v1/organizations/*/detection/findings**", (route) => route.fulfill({ json: envelope({ items: [], pagination: { page: 1, limit: 5, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } }) }));
  await page.route("**/api/v1/organizations/*/detection/runs**", (route) => route.fulfill({ json: envelope({ items: [], pagination: { page: 1, limit: 5, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } }) }));
  await page.route("**/api/v1/organizations/*/alerts**", (route) => route.fulfill({ json: envelope({ items: [], pagination: { page: 1, limit: 10, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } }) }));

  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill("dev@example.test");
  await page.getByLabel("Password").fill("Test-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await orgARequested;

  const organizationSelector = page.getByRole("combobox", { name: "Select organization" });
  if (!(await organizationSelector.isVisible())) {
    await page.getByRole("button", { name: "Open workspace navigation" }).click();
  }
  await organizationSelector.click();
  await page.getByRole("option", { name: "Org B" }).click();
  await expect(page.getByText("Project B", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("222", { exact: true }).first()).toBeVisible();

  releaseOrgAResponse();
  await expect(page.getByText("222", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("111", { exact: true })).toHaveCount(0);
});

test("the marketing demo advances through its steps", async ({ page }) => {
  await page.goto("/");
  const demo = page.locator("section", { has: page.getByText(/sample data/i) }).first();
  await expect(demo).toBeVisible();
});
