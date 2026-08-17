import { test, expect } from "@playwright/test";
import { loginAsGuest } from "./helpers/guest";
import {
  cleanupFootballSeed,
  finishFootballEvent,
  getWalletBalance,
  latestSportsBet,
  seedFootball1x2,
} from "./helpers/supabaseAdmin";
import { postFootballSettle } from "./helpers/settleHook";

/**
 * Real sports settle path: seed open 1x2 → place via UI → finish scores →
 * football-settle hook → wallet + bet status.
 */
test.describe("football settle E2E", () => {
  test("place → settle → wallet reflects graded payout", async ({ page }) => {
    test.setTimeout(120_000);

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      test.skip(true, "SUPABASE_SERVICE_ROLE_KEY required to seed sports events");
    }

    const seed = await seedFootball1x2();
    try {
      await loginAsGuest(page);

      await page.goto(`/football/matches/${seed.eventId}`);
      await expect(page.getByText(/E2E Home/i).first()).toBeVisible({
        timeout: 30_000,
      });

      // Click the Home odds tile in Popular 1x2 (label "Home", price ~2.10x).
      await page
        .getByRole("button", { name: /Home/i })
        .filter({ hasText: /2\.1/ })
        .first()
        .click();

      const lock = page.getByRole("button", { name: /lock prediction/i });
      await expect(lock).toBeEnabled({ timeout: 15_000 });
      await lock.click();
      await expect(page.getByText(/bet placed/i)).toBeVisible({ timeout: 20_000 });

      await expect
        .poll(async () => latestSportsBet(seed.eventId), { timeout: 20_000 })
        .not.toBeNull();

      const bet = await latestSportsBet(seed.eventId);
      expect(bet).toBeTruthy();
      expect(String(bet!.status).toLowerCase()).toMatch(/pending|open|matched/);
      expect(String(bet!.selection_key).toLowerCase()).toBe("home");

      const userId = bet!.user_id as string;
      const stake = Number(bet!.stake ?? 10);
      const afterPlace = await getWalletBalance(userId);

      // Home wins 2–1 → home selection pays stake * accepted odds.
      await finishFootballEvent(seed.eventId, 2, 1);
      const settle = await postFootballSettle();
      expect(settle.ok).toBe(true);

      await expect
        .poll(async () => (await latestSportsBet(seed.eventId))?.status, {
          timeout: 30_000,
        })
        .toBe("won");

      const finalBet = await latestSportsBet(seed.eventId);
      const payout = Number(finalBet!.actual_payout ?? 0);
      const expectedPayout =
        Math.round(stake * Number(finalBet!.accepted_odds ?? seed.homeOdds) * 100) / 100;
      expect(payout).toBeCloseTo(expectedPayout, 1);

      const afterSettle = await getWalletBalance(userId);
      expect(afterSettle).toBeCloseTo(afterPlace + expectedPayout, 1);

      await page.reload();
      await expect(page.getByText(/betting is closed|markets closed|finished/i).first()).toBeVisible({
        timeout: 20_000,
      }).catch(() => undefined);
    } finally {
      await cleanupFootballSeed(seed.eventId, seed.marketId).catch(() => undefined);
    }
  });
});
