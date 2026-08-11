import { test, expect } from "@playwright/test";

test.describe("public pages smoke tests", () => {
  test("landing page offers a demo account and sign-in/register", async ({ page }) => {
    // "/" silently mints an anonymous guest session and then hard-redirects
    // to /dashboard within ~100ms of it succeeding (src/routes/index.tsx).
    // Block the auth call so we can assert on the pre-redirect guest-gate
    // content itself instead of racing it.
    await page.route("**/auth/v1/**", (route) => route.abort());
    await page.goto("/");
    await expect(page.getByRole("link", { name: /open app/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in.*register/i })).toBeVisible();
  });

  test("auth page renders sign-in form", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
  });
});

test.describe("pages behind the anonymous guest session", () => {
  // /support, /trust-center and /status all live under the `_authenticated`
  // layout — they only appear reachable "without logging in" because a
  // fresh visit to `/` silently mints an anonymous guest session
  // (src/routes/index.tsx) before redirecting into the app. A truly
  // sessionless request to these URLs bounces to /auth. Mint the guest
  // session first so these checks reflect what a real first-time visitor
  // sees, not a stale authenticated browser profile.
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
  });

  test("support page loads for an anonymous guest session", async ({ page }) => {
    await page.goto("/support");
    await expect(page).toHaveURL(/\/support/);
  });

  test("trust center loads for an anonymous guest session", async ({ page }) => {
    await page.goto("/trust-center");
    await expect(page).toHaveURL(/\/trust-center/);
  });

  test("status page never shows the duplicated 'no recent check' text", async ({ page }) => {
    // Regression test: StatusGrid used to render "Last check no recent check"
    // right next to a "No recent check" chip when a service had never been
    // checked, producing "LAST CHECK NO RECENT CHECK, NO RECENT CHECK".
    await page.goto("/status");
    await expect(page.getByText(/no recent check.*no recent check/i)).toHaveCount(0);
  });
});
