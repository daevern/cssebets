import { test, expect } from "@playwright/test";
import { loginAsGuest, readBalance, waitForBalanceChange } from "./helpers/guest";

/**
 * Real arcade settle path: guest session → place round → server settle →
 * result dialog + wallet balance moves.
 */
test.describe("arcade settle E2E", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000);
    await loginAsGuest(page);
  });

  test("dice round settles and updates wallet balance", async ({ page }) => {
    await page.goto("/arcade/dice");
    await expect(page.getByRole("heading", { name: /dice/i }).or(page.getByText("◆ DICE ◆"))).toBeVisible({
      timeout: 30_000,
    }).catch(async () => {
      await expect(page.getByTestId("hud-balance")).toBeVisible({ timeout: 30_000 });
    });

    const before = await readBalance(page);

    const roll = page.getByRole("button", { name: /roll/i });
    await expect(roll).toBeEnabled({ timeout: 20_000 });
    await roll.click();

    await expect(page.getByTestId("arcade-result-dialog")).toBeVisible({ timeout: 45_000 });
    await expect(
      page.getByRole("heading", { name: /rolled it|missed/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /continue/i }).click();

    const after = await waitForBalanceChange(page, before);
    expect(after).not.toBe(before);
    // Stake leaves the wallet on every settle; win may net positive after payout.
    expect(Math.abs(after - before)).toBeGreaterThan(0);
  });

  test("keno ticket settles and updates wallet balance", async ({ page }) => {
    await page.goto("/arcade/keno");
    await expect(page.getByTestId("hud-balance")).toBeVisible({ timeout: 30_000 });

    const before = await readBalance(page);

    await page.getByRole("button", { name: /quick pick/i }).click();
    const play = page.getByRole("button", { name: /play|draw again/i });
    await expect(play).toBeEnabled({ timeout: 15_000 });
    await play.click();

    await expect(page.getByTestId("arcade-result-dialog")).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByRole("heading", { name: /ticket pays|no hits worth paying/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /continue/i }).click();

    const after = await waitForBalanceChange(page, before);
    expect(after).not.toBe(before);
  });
});
