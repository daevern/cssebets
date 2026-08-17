import { test, expect } from "@playwright/test";
import { loginAsGuest } from "./helpers/guest";

test.describe("referrals E2E", () => {
  test("referral code visible with Copy Link", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsGuest(page);
    await page.goto("/referrals");

    await expect(page.getByRole("heading", { name: /referrals/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/your referral code/i)).toBeVisible();
    // Code is a mono block — wait until it is not the placeholder dash.
    await expect
      .poll(async () => {
        const text = await page.locator(".font-mono").first().innerText();
        return text.replace(/\s/g, "");
      }, { timeout: 20_000 })
      .not.toBe("—");

    await expect(page.getByRole("button", { name: /copy link/i })).toBeVisible();
  });
});
