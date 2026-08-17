import { test, expect } from "@playwright/test";
import { loginAsGuest } from "./helpers/guest";

test.describe("leagues E2E", () => {
  test("create league and see standings table", async ({ page }) => {
    test.setTimeout(90_000);
    await loginAsGuest(page);

    const name = `E2E League ${Date.now().toString(36).slice(-6)}`;
    await page.goto("/leagues");
    await expect(page.getByRole("heading", { name: /leagues/i })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByPlaceholder(/league name/i).fill(name);
    await page.getByRole("button", { name: /^create$/i }).click();

    await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/multi-sport standings/i)).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /member/i })).toBeVisible();
    await expect(page.getByText(/you/i).first()).toBeVisible({ timeout: 15_000 });

    // Sport filter chips (all / wc / football / f1 / ufc)
    await expect(page.getByRole("button", { name: /^all$/i })).toBeVisible();
    await page.getByRole("button", { name: /^football$/i }).click();
    await expect(page.getByRole("columnheader", { name: /member/i })).toBeVisible();
  });
});
