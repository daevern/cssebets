import { test, expect } from "@playwright/test";
import { loginAsGuest } from "./helpers/guest";
import {
  cleanupUfcSeed,
  getWalletBalance,
  latestUfcBet,
  seedUfcMoneyline,
  settleUfcFightWinner,
} from "./helpers/supabaseAdmin";

test.describe("UFC settle E2E", () => {
  test("place moneyline → auto_settle winner → wallet payout", async ({ page }) => {
    test.setTimeout(120_000);
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      test.skip(true, "SUPABASE_SERVICE_ROLE_KEY required");
    }

    const seed = await seedUfcMoneyline();
    try {
      await loginAsGuest(page);
      await page.goto(`/ufc/${seed.fightId}`);
      await expect(page.getByText(/E2E Alpha/i).first()).toBeVisible({ timeout: 30_000 });

      await page
        .getByRole("button", { name: /E2E Alpha/i })
        .filter({ hasText: /2\.1/ })
        .first()
        .click();
      await page.getByRole("button", { name: /lock prediction/i }).click();
      await expect(page.getByText(/prediction locked/i)).toBeVisible({ timeout: 20_000 });

      await expect
        .poll(async () => latestUfcBet(seed.fightId), { timeout: 20_000 })
        .not.toBeNull();
      const bet = await latestUfcBet(seed.fightId);
      expect(bet!.status).toBe("open");
      expect(String(bet!.selection_key)).toBe("a");

      const afterPlace = await getWalletBalance(bet!.user_id as string);
      await settleUfcFightWinner(seed.fightId, "a");

      await expect
        .poll(async () => (await latestUfcBet(seed.fightId))?.status, { timeout: 30_000 })
        .toBe("won");

      const finalBet = await latestUfcBet(seed.fightId);
      const payout = Number(finalBet!.payout ?? finalBet!.potential_payout ?? 0);
      expect(payout).toBeGreaterThan(0);

      const afterSettle = await getWalletBalance(bet!.user_id as string);
      expect(afterSettle).toBeCloseTo(afterPlace + payout, 1);
    } finally {
      await cleanupUfcSeed(seed.eventId, seed.fightId).catch(() => undefined);
    }
  });
});
