// Canonical bankroll reader.
//
// Authority (see docs/SYSTEM_OVERVIEW.md §0): the accounting journal
// (`accounting_account_balances.HOUSE_BANKROLL`) is the source of truth for the
// house bankroll. The legacy `platform_bankroll` row is only written by legacy
// sports settlement (`place_bet_atomic` / `platform_apply_change`) and does NOT
// move for arcade play, so it must never be displayed as "the bankroll".
//
// Every admin surface should read through this helper.

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

export async function readAuthoritativeBankroll(
  supabaseAdmin: any,
  environment: "PRODUCTION" | "SIMULATION" | "TEST" = "PRODUCTION",
): Promise<AuthoritativeBankroll> {
  const { data, error } = await supabaseAdmin.rpc("accounting_bankroll_reconciliation", {
    p_environment: environment,
  });
  if (error || !data) return EMPTY;
  const auth = (data as any).authoritative ?? {};
  const legacy = (data as any).legacy ?? {};
  return {
    balance: Number(auth.house_bankroll ?? 0),
    payable: Number(auth.payouts_payable ?? 0),
    reservedLiability: Number(auth.active_reserved_liability ?? 0),
    availableReserve: Number(auth.available_reserve ?? 0),
    legacyBalance: Number(legacy.balance ?? 0),
    legacyUpdatedAt: legacy.updated_at ?? null,
    delta: Number((data as any).delta_journal_minus_legacy ?? 0),
    generatedAt: (data as any).generated_at ?? null,
    ok: true,
  };
}
