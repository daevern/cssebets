import { test, expect } from "@playwright/test";

/**
 * Covers the 4-step /register flow. A browser walkthrough previously reported
 * this as "completely broken" (silent failure on submit) — root-caused to a
 * local dev environment missing SUPABASE_SERVICE_ROLE_KEY, which every
 * auth attempt depends on via the fail-closed rate limiter
 * (see docs/RUNBOOK.md → "Local dev environment"). These tests pin down the
 * exact, expected behavior so a regression here is caught by CI/local runs
 * instead of by an end user.
 */

function uniqueEmail() {
  return `pw-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

test.describe("registration — step validation", () => {
  test("step 1 blocks empty display name", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /addressed by the community/i })).toBeVisible();

    await page.getByRole("button", { name: "Continue", exact: true }).click();

    // Should still be on step 1 — the name field must still be present and
    // the step indicator must not have advanced.
    await expect(page.getByLabel("Name")).toBeVisible();
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
  });

  test("valid name advances to the contact step", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Name").fill("PWTestUser");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Step 2 of 4")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("step 2 blocks an invalid email", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Name").fill("PWTestUser");
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    // Must not advance past step 2 on an invalid email.
    await expect(page.getByText("Step 2 of 4")).toBeVisible();
  });

  test("step 3 blocks a short password and a mismatched confirmation", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Name").fill("PWTestUser");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Email").fill(uniqueEmail());
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    await page.getByLabel("Password", { exact: true }).fill("weak");
    await page.getByLabel("Confirm password").fill("weak");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Step 3 of 4")).toBeVisible();

    await page.getByLabel("Password", { exact: true }).fill("StrongPass123!");
    await page.getByLabel("Confirm password").fill("DifferentPass456!");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Step 3 of 4")).toBeVisible();
  });

  test("full valid flow reaches the final step and submitting surfaces a clear result", async ({
    page,
  }) => {
    await page.goto("/register");
    await page.getByLabel("Name").fill("PWTestUser");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Email").fill(uniqueEmail());
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Password", { exact: true }).fill("StrongPass123!");
    await page.getByLabel("Confirm password").fill("StrongPass123!");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Step 4 of 4")).toBeVisible();

    await page.getByRole("button", { name: "Create account" }).click();

    // Whatever the outcome (success toast + redirect, or a rate-limit /
    // infra error toast), the user must see SOME feedback — a silent,
    // unexplained failure with no toast and no redirect is the bug this
    // test exists to catch.
    const toast = page.locator("[data-sonner-toast]").first();
    const redirected = page.waitForURL(/\/(dashboard|auth)/, { timeout: 8_000 }).then(() => true).catch(() => false);
    const toasted = toast.waitFor({ state: "visible", timeout: 8_000 }).then(() => true).catch(() => false);

    const [gotToast, gotRedirect] = await Promise.all([toasted, redirected]);
    expect(gotToast || gotRedirect, "registration submit produced neither a toast nor a redirect").toBe(true);
  });
});
