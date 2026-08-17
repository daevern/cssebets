import { test, expect } from "@playwright/test";
import { getSessionUserId, loginAsGuest } from "./helpers/guest";
import {
  cleanupWcMatch,
  finishWcMatch,
  getWalletBalance,
  latestPrediction,
  placeWcPredictionViaRpc,
  seedWcMatch1x2,
  settleWcMatch,
} from "./helpers/supabaseAdmin";

test.describe("WC settle E2E", () => {
  test("place 1x2 via RPC → finish → settle → won", async ({ page }) => {
    test.setTimeout(120_000);
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      test.skip(true, "SUPABASE_SERVICE_ROLE_KEY required");
    }

    const seed = await seedWcMatch1x2();
    try {
      await loginAsGuest(page);
      const userId = await getSessionUserId(page);
      const stake = 10;

      await placeWcPredictionViaRpc(userId, seed.matchId, "HOME", stake, seed.homeOdds);

      await expect
        .poll(async () => latestPrediction(seed.matchId), { timeout: 20_000 })
        .not.toBeNull();

      const pred = await latestPrediction(seed.matchId);
      expect(pred!.user_id).toBe(userId);
      expect(String(pred!.outcome).toUpperCase()).toBe("HOME");
      expect(String(pred!.status).toLowerCase()).toMatch(/pending|open/);

      const afterPlace = await getWalletBalance(userId);
      await finishWcMatch(seed.matchId, 2, 1);
      await settleWcMatch(seed.matchId, 2, 1);

      await expect
        .poll(async () => (await latestPrediction(seed.matchId))?.status, {
          timeout: 30_000,
        })
        .toBe("won");

      const finalPred = await latestPrediction(seed.matchId);
      const expectedReturn =
        Math.round(stake * Number(finalPred!.reference_odds ?? seed.homeOdds) * 100) / 100;
      const credited = Number(finalPred!.potential_return ?? finalPred!.points ?? 0);
      // Settlement credits stake*odds (gross) or net depending on schema — wallet is source of truth.
      const afterSettle = await getWalletBalance(userId);
      expect(afterSettle).toBeGreaterThan(afterPlace);
      expect(afterSettle).toBeCloseTo(afterPlace + expectedReturn, 1);
      void credited;
    } finally {
      await cleanupWcMatch(seed.matchId).catch(() => undefined);
    }
  });
});
