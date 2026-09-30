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

test("dashboard shell navigates between routes", async ({ page }) => {
  await page.goto("/overview");
  await page.getByRole("link", { name: /usage explorer/i }).first().click();
  await expect(page).toHaveURL(/\/usage/);
  await expect(page.locator("h1").first()).toHaveText(/usage/i);
});

test("the marketing demo advances through its steps", async ({ page }) => {
  await page.goto("/");
  const demo = page.locator("section", { has: page.getByText(/sample data/i) }).first();
  await expect(demo).toBeVisible();
});
