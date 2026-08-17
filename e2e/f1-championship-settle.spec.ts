import { test, expect } from "@playwright/test";
import { getSessionUserId, loginAsGuest } from "./helpers/guest";
import {
  cleanupF1Champ,
  getWalletBalance,
  latestF1ChampBet,
  placeF1ChampBetViaRpc,
  seedF1ChampionshipDrivers,
  settleF1ChampionshipOffline,
} from "./helpers/supabaseAdmin";

const E2E_SEASON = 2099;

test.describe("F1 championship settle E2E", () => {
  test("place champ bet → settle offline → wallet payout", async ({ page }) => {
    test.setTimeout(120_000);
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      test.skip(true, "SUPABASE_SERVICE_ROLE_KEY required");
    }

    const seed = await seedF1ChampionshipDrivers(E2E_SEASON);
    try {
      await loginAsGuest(page);
      const userId = await getSessionUserId(page);
      const stake = 10;

      await placeF1ChampBetViaRpc(userId, seed.marketIdA, stake, 2.05);

      await expect
        .poll(async () => latestF1ChampBet(seed.marketIdA), { timeout: 20_000 })
        .not.toBeNull();

      const bet = await latestF1ChampBet(seed.marketIdA);
      expect(bet!.status).toBe("open");
      expect(String(bet!.selection_key)).toBe(seed.keyA);

      const afterPlace = await getWalletBalance(userId);
      await settleF1ChampionshipOffline(seed.season, seed.keyA);

      await expect
        .poll(async () => (await latestF1ChampBet(seed.marketIdA))?.status, {
          timeout: 20_000,
        })
        .toBe("won");

      const finalBet = await latestF1ChampBet(seed.marketIdA);
      const payout = Number(finalBet!.potential_payout ?? 0);
      expect(payout).toBeCloseTo(stake * Number(finalBet!.odds_locked ?? 2), 1);
      expect(await getWalletBalance(userId)).toBeCloseTo(afterPlace + payout, 1);
    } finally {
      await cleanupF1Champ(seed.season).catch(() => undefined);
    }
  });
});
