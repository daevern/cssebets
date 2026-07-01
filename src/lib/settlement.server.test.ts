import { beforeEach, describe, expect, it, vi } from "vitest";
import { settlePredictionsForMatch, voidMatch } from "./settlement.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const rpc = vi.mocked(supabaseAdmin.rpc);
const matchId = "11111111-1111-4111-8111-111111111111";

describe("settlement server wrappers", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("calls the atomic all-market settlement RPC with full score context", async () => {
    rpc.mockResolvedValueOnce({ data: 7, error: null });

    await expect(settlePredictionsForMatch(matchId, 2, 1, 1, 0, "HOME")).resolves.toBe(7);

    expect(rpc).toHaveBeenCalledWith("settle_match_all_markets_atomic", {
      p_match_id: matchId,
      p_home: 2,
      p_away: 1,
      p_home_ht: 1,
      p_away_ht: 0,
      p_qualifier: "HOME",
    });
  });

  it("surfaces settlement RPC failures without fabricating partial success", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "INVALID_STATUS_ALREADY_SETTLED" } });

    await expect(settlePredictionsForMatch(matchId, 2, 1)).rejects.toThrow("INVALID_STATUS_ALREADY_SETTLED");
  });

  it("calls the atomic void RPC and returns refunded count", async () => {
    rpc.mockResolvedValueOnce({ data: 3, error: null });

    await expect(voidMatch(matchId)).resolves.toBe(3);
    expect(rpc).toHaveBeenCalledWith("void_match_atomic", { p_match_id: matchId });
  });
});
