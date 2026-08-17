/**
 * Typed money / settlement RPCs — prefer these over `(supabaseAdmin as any).rpc(...)`.
 * Generated `Database` types are authoritative; nullability fixes for lagging
 * Arg shapes live only in this file.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AppSupabase = SupabaseClient<Database>;

type PlaceBetArgs = Database["public"]["Functions"]["place_bet_atomic"]["Args"];
/** Runtime accepts null match for tournament outrights; generated Args lag. */
export type PlaceBetAtomicArgs = Omit<PlaceBetArgs, "p_match_id"> & {
  p_match_id: string | null;
};

export type WalletApplyChangeArgs = Database["public"]["Functions"]["wallet_apply_change"]["Args"];

export async function rpcCheckRateLimit(
  args: Database["public"]["Functions"]["check_rate_limit"]["Args"],
  client: AppSupabase = supabaseAdmin,
) {
  return client.rpc("check_rate_limit", args);
}

export async function rpcPlaceBetAtomic(
  args: PlaceBetAtomicArgs,
  client: AppSupabase = supabaseAdmin,
) {
  return client.rpc("place_bet_atomic", args as PlaceBetArgs);
}

export async function rpcWalletApplyChange(
  args: WalletApplyChangeArgs,
  client: AppSupabase = supabaseAdmin,
) {
  return client.rpc("wallet_apply_change", args);
}

export async function rpcSettleMatchAllMarketsAtomic(
  args: Database["public"]["Functions"]["settle_match_all_markets_atomic"]["Args"],
  client: AppSupabase = supabaseAdmin,
) {
  return client.rpc("settle_match_all_markets_atomic", args);
}

export async function rpcVoidMatchAtomic(
  args: Database["public"]["Functions"]["void_match_atomic"]["Args"],
  client: AppSupabase = supabaseAdmin,
) {
  return client.rpc("void_match_atomic", args);
}

export async function rpcEditPendingBetStake(
  args: Database["public"]["Functions"]["edit_pending_bet_stake"]["Args"],
  client: AppSupabase = supabaseAdmin,
) {
  return client.rpc("edit_pending_bet_stake", args);
}

export async function rpcCancelPendingBet(
  args: Database["public"]["Functions"]["cancel_pending_bet"]["Args"],
  client: AppSupabase = supabaseAdmin,
) {
  return client.rpc("cancel_pending_bet", args);
}

export async function rpcAccountingBankrollReconciliation(
  environment: Database["public"]["Enums"]["acct_environment"] = "PRODUCTION",
  client: AppSupabase = supabaseAdmin,
) {
  return client.rpc("accounting_bankroll_reconciliation", {
    p_environment: environment,
  });
}
