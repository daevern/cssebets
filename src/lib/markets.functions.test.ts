import { describe, expect, it } from "vitest";
import { MARKET_KEYS, PlaceMarketBetSchema, mapPlaceMarketBetErrorMessage } from "./markets.functions";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("market placement production validation", () => {
  it("accepts a valid market entry payload", () => {
    const parsed = PlaceMarketBetSchema.parse({
      matchId: uuid,
      market: MARKET_KEYS[0],
      selection: "OVER_2_5",
      stake: 50,
      clientRequestId: "22222222-2222-4222-8222-222222222222",
    });

    expect(parsed).toMatchObject({ matchId: uuid, stake: 50 });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1_000_001])("rejects invalid stake %p", (stake) => {
    expect(() => PlaceMarketBetSchema.parse({ matchId: uuid, market: "btts", selection: "YES", stake })).toThrow();
  });

  it("rejects user id tampering by not accepting userId in the client payload", () => {
    const parsed = PlaceMarketBetSchema.parse({
      matchId: uuid,
      market: "btts",
      selection: "YES",
      stake: 10,
      userId: "attacker-controlled",
    });

    expect(parsed).not.toHaveProperty("userId");
  });

  it("does not accept client-provided odds or multiplier", () => {
    const parsed = PlaceMarketBetSchema.parse({
      matchId: uuid,
      market: "btts",
      selection: "YES",
      stake: 10,
      odds: 999,
      multiplier: 999,
    });

    expect(parsed).not.toHaveProperty("odds");
    expect(parsed).not.toHaveProperty("multiplier");
  });

  it.each([
    ["INSUFFICIENT_BALANCE", "Insufficient points balance."],
    ["DUPLICATE_REQUEST", "Duplicate submit detected"],
    ["MATCH_LOCKED", "Match has kicked off"],
    ["ODDS_STALE", "Market temporarily suspended"],
    ["MAX_SINGLE_BET_PAYOUT", "Potential return exceeds"],
    ["USER_CORRELATED_PAYOUT_EXCEEDED", "too similar"],
  ])("maps RPC error %s to a user-safe message", (rpc, expected) => {
    expect(mapPlaceMarketBetErrorMessage(rpc)).toContain(expected);
  });
});
