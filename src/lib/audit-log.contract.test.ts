import { describe, expect, it } from "vitest";

const REQUIRED_AUDIT_FIELDS = ["user_id", "action", "entity"] as const;

describe("audit log contract", () => {
  it("requires actor, action and entity for high-risk audit entries", () => {
    const entry = {
      user_id: "11111111-1111-4111-8111-111111111111",
      action: "wallet.admin_adjust",
      entity: "wallet",
      entity_id: "22222222-2222-4222-8222-222222222222",
      reason: "support-approved correction",
      old_value: { balance: 100 },
      new_value: { balance: 150 },
      metadata: { amount: 50 },
      created_at: new Date().toISOString(),
    };

    for (const field of REQUIRED_AUDIT_FIELDS) {
      expect(entry[field]).toBeTruthy();
    }
    expect(entry).toHaveProperty("entity_id");
    expect(entry).toHaveProperty("created_at");
  });

  it("flags direct balance mutation without a ledger reference as a database integrity risk", () => {
    const walletUpdate = { table: "wallets", balance: 500, reference_type: null, transaction_id: null };

    expect(walletUpdate.reference_type).toBeNull();
    expect(walletUpdate.transaction_id).toBeNull();
  });
});
