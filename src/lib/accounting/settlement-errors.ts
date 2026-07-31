/**
 * Controlled application responses for settlement attempts.
 *
 * The database raises a labelled `ALREADY_SETTLED` error (SQLSTATE P0409) from
 * `settlement_journal_guard`, and `settlement_try_claim()` returns an
 * `ALREADY_SETTLED` payload instead of a raw unique_violation. Both paths are
 * normalised here so callers never surface a Postgres constraint error.
 */

export type SettlementResponse =
  | {
      status: "SETTLED";
      claimId: string;
      settlementVersion: number;
      settlementAction: string;
    }
  | {
      status: "ALREADY_SETTLED";
      claimId?: string;
      settlementVersion?: number;
      settlementAction?: string;
      finalStatus?: string | null;
      grossPayout?: number | null;
      settledAt?: string | null;
      message: string;
    };

const ALREADY_SETTLED_CODES = new Set(["P0409", "23505"]);

function codeOf(error: unknown): string | undefined {
  const e = error as { code?: string; details?: string } | null;
  return e?.code;
}

function messageOf(error: unknown): string {
  const e = error as { message?: string } | null;
  return e?.message ?? String(error);
}

/** True when an error means "this settlement version was already recorded". */
export function isAlreadySettled(error: unknown): boolean {
  const code = codeOf(error);
  if (code && ALREADY_SETTLED_CODES.has(code)) return true;
  return /ALREADY_SETTLED|settlement_journal_(unique|idem_key)/i.test(messageOf(error));
}

/** Normalises a `settlement_try_claim()` result row into an app response. */
export function fromClaimResult(row: Record<string, unknown> | null): SettlementResponse {
  const status = String(row?.status ?? "");
  if (status === "CLAIMED") {
    return {
      status: "SETTLED",
      claimId: String(row?.claim_id),
      settlementVersion: Number(row?.settlement_version),
      settlementAction: String(row?.settlement_action),
    };
  }
  return {
    status: "ALREADY_SETTLED",
    claimId: row?.claim_id ? String(row.claim_id) : undefined,
    settlementVersion: row?.settlement_version ? Number(row.settlement_version) : undefined,
    settlementAction: row?.settlement_action ? String(row.settlement_action) : undefined,
    finalStatus: (row?.final_status as string | null) ?? null,
    grossPayout: row?.gross_payout == null ? null : Number(row.gross_payout),
    settledAt: (row?.settled_at as string | null) ?? null,
    message: "This settlement was already recorded; no money was moved again.",
  };
}

/**
 * Wraps a settlement call so a duplicate attempt resolves to an idempotent
 * ALREADY_SETTLED response instead of throwing a database constraint error.
 */
export async function runSettlement<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; result: T } | { ok: false; response: SettlementResponse }> {
  try {
    return { ok: true, result: await fn() };
  } catch (error) {
    if (isAlreadySettled(error)) {
      return {
        ok: false,
        response: {
          status: "ALREADY_SETTLED",
          message: "This settlement was already recorded; no money was moved again.",
        },
      };
    }
    throw error;
  }
}
