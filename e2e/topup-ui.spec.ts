import { test, expect } from "@playwright/test";
import { loginAsGuest } from "./helpers/guest";
import {
  approveUserAsAdmin,
  findAuthUserIdByEmail,
  userHasRole,
} from "./helpers/supabaseAdmin";

function uniqueEmail() {
  return `pw-topup-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

test.describe("top-up UI", () => {
  test("upgrade+approve then top-up amount modal shows Continue", async ({ page }) => {
    test.setTimeout(120_000);
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      test.skip(true, "SUPABASE_SERVICE_ROLE_KEY required");
    }

    const email = uniqueEmail();
    const password = "StrongPass123!";

    await loginAsGuest(page);
    await page.goto("/register");
    await expect(page.getByText(/Upgrade demo account|Create account/i).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.getByLabel("Name").fill("TopupPW");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Step 4 of 4")).toBeVisible();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/Pending review/i)).toBeVisible({ timeout: 45_000 });

    const userId = await findAuthUserIdByEmail(email);
    await approveUserAsAdmin(userId);
    await expect.poll(async () => userHasRole(userId, "member"), { timeout: 20_000 }).toBe(true);

    await page.getByRole("button", { name: /Check status/i }).click();
    await expect(page.getByText(/Pending review/i)).toHaveCount(0, { timeout: 30_000 });

    await page.goto("/wallet");
    await expect(page.getByRole("button", { name: /top-up/i })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: /top-up/i }).click();

    await expect(page.getByRole("heading", { name: /top up/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /continue/i })).toBeVisible();
  });
});
