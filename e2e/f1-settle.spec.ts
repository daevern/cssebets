import { test, expect } from "@playwright/test";
import { loginAsGuest } from "./helpers/guest";
import {
  cleanupF1Seed,
  finishF1RaceWithSeededResults,
  getWalletBalance,
  latestF1Bet,
  seedF1Top5,
} from "./helpers/supabaseAdmin";
import { postF1Settle } from "./helpers/settleHook";

test.describe("F1 settle E2E", () => {
  test("place top-5 → seed results → f1-settle → wallet payout", async ({ page }) => {
    test.setTimeout(120_000);
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      test.skip(true, "SUPABASE_SERVICE_ROLE_KEY required");
    }

    const seed = await seedF1Top5();
    try {
      await loginAsGuest(page);
      await page.goto(`/f1/races/${seed.raceId}`);
      await expect(page.getByText(/E2E Driver|E2E Grand Prix/i).first()).toBeVisible({
        timeout: 30_000,
      });

      await page
        .getByRole("button", { name: /E2E Driver/i })
        .filter({ hasText: /2\.1/ })
        .first()
        .click();
      await page.getByRole("button", { name: /lock prediction/i }).click();
      await expect(page.getByText(/prediction locked/i)).toBeVisible({ timeout: 20_000 });

      await expect
        .poll(async () => latestF1Bet(seed.raceId), { timeout: 20_000 })
        .not.toBeNull();
      const bet = await latestF1Bet(seed.raceId);
      expect(bet!.status).toBe("open");
      expect(String(bet!.selection_key)).toBe(seed.driverKey);

      const afterPlace = await getWalletBalance(bet!.user_id as string);
      await finishF1RaceWithSeededResults(seed.raceId, seed.driverKey);
      const settle = await postF1Settle();
      expect(settle.ok).toBe(true);

      await expect
        .poll(async () => (await latestF1Bet(seed.raceId))?.status, { timeout: 30_000 })
        .toBe("won");

      const finalBet = await latestF1Bet(seed.raceId);
      const payout = Number(finalBet!.potential_payout ?? 0);
      expect(payout).toBeCloseTo(Number(finalBet!.stake) * Number(finalBet!.odds_locked), 1);

      const afterSettle = await getWalletBalance(bet!.user_id as string);
      expect(afterSettle).toBeCloseTo(afterPlace + payout, 1);
    } finally {
      await cleanupF1Seed(seed.raceId, seed.marketId).catch(() => undefined);
    }
  });
});
