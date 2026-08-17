// Canonical bankroll reader.
//
// Authority (see docs/SYSTEM_OVERVIEW.md §0): the accounting journal
// (`accounting_account_balances.HOUSE_BANKROLL`) is the source of truth for the
// house bankroll. The legacy `platform_bankroll` row is only written by legacy
// sports settlement (`place_bet_atomic` / `platform_apply_change`) and does NOT
// move for arcade play, so it must never be displayed as "the bankroll".
//
// Every admin surface should read through this helper.

import type { AppSupabase } from "@/lib/supabase-rpc.server";
import { rpcAccountingBankrollReconciliation } from "@/lib/supabase-rpc.server";
import type { Json } from "@/integrations/supabase/types";

export type AuthoritativeBankroll = {
  /** Journal HOUSE_BANKROLL balance — canonical. */
  balance: number;
  /** Outstanding payouts payable at the ledger. */
  payable: number;
  /** Enforced liability reservations currently held. */
  reservedLiability: number;
  /** balance − payable − reservations (accounting_available_reserve). */
  availableReserve: number;
  /** Legacy platform_bankroll row, kept for reconciliation display only. */
  legacyBalance: number;
  legacyUpdatedAt: string | null;
  /** journal − legacy. Non-zero is expected while sports remain legacy. */
  delta: number;
  generatedAt: string | null;
  /** False when the RPC could not be read (caller should degrade gracefully). */
  ok: boolean;
};

const EMPTY: AuthoritativeBankroll = {
  balance: 0,
  payable: 0,
  reservedLiability: 0,
  availableReserve: 0,
  legacyBalance: 0,
  legacyUpdatedAt: null,
  delta: 0,
  generatedAt: null,
  ok: false,
};

function asRecord(value: Json | null | undefined): Record<string, Json | undefined> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, Json | undefined>;
  }
  return {};
}

function num(value: Json | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? fallback) || fallback;
}

export async function readAuthoritativeBankroll(
  _supabaseAdmin?: AppSupabase,
  environment: "PRODUCTION" | "SIMULATION" | "TEST" = "PRODUCTION",
): Promise<AuthoritativeBankroll> {
  const { data, error } = await rpcAccountingBankrollReconciliation(environment, _supabaseAdmin);
  if (error || !data) return EMPTY;
  const root = asRecord(data);
  const auth = asRecord(root.authoritative ?? null);
  const legacy = asRecord(root.legacy ?? null);
  return {
    balance: num(auth.house_bankroll),
    payable: num(auth.payouts_payable),
    reservedLiability: num(auth.active_reserved_liability),
    availableReserve: num(auth.available_reserve),
    legacyBalance: num(legacy.balance),
    legacyUpdatedAt: typeof legacy.updated_at === "string" ? legacy.updated_at : null,
    delta: num(root.delta_journal_minus_legacy),
    generatedAt: typeof root.generated_at === "string" ? root.generated_at : null,
    ok: true,
  };
}
