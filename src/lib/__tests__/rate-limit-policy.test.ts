import { describe, expect, it } from "vitest";
import {
  RATE_LIMITS,
  rateLimitFailsClosedOnInfraError,
  type RateLimitAction,
} from "@/lib/rate-limit.functions";

describe("rate-limit fail-closed policy", () => {
  const moneyOrAuth: RateLimitAction[] = [
    "bet_placement",
    "point_request_submit",
    "proof_upload",
    "auth_attempt",
    "arcade_drop",
    "arcade_spin",
    "arcade_treasure",
    "blackjack_action",
    "arcade_rps",
  ];

  it("fails closed for every money and auth action", () => {
    for (const action of moneyOrAuth) {
      expect(rateLimitFailsClosedOnInfraError(action)).toBe(true);
    }
  });

  it("fails open for support messaging", () => {
    expect(rateLimitFailsClosedOnInfraError("support_message")).toBe(false);
  });

  it("covers every RATE_LIMITS key with an explicit policy", () => {
    for (const action of Object.keys(RATE_LIMITS) as RateLimitAction[]) {
      expect(typeof rateLimitFailsClosedOnInfraError(action)).toBe("boolean");
    }
  });
});
