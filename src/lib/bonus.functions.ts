import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CampaignStatus = {
  active: boolean;
  code?: string;
  startsAt?: string;
  bonusAmount?: number;
  cap?: number;
  slotsTaken?: number;
  slotsRemaining?: number;
};

export type BonusClaimResult = {
  awarded: boolean;
  already?: boolean;
  group?: "EXISTING_USER" | "NEW_USER";
  slot?: number | null;
  amount?: number;
  reason?: string;
};

export type WalletBreakdown = {
  total: number;
  withdrawable: number;
  lockedBonus: number;
  reserved: number;
  canWithdraw: boolean;
  minWithdrawable: number;
  minTotal: number;
  blockReason: string | null;
};

/** Public: remaining new-user slots. No user details are exposed. */
export const getCampaignStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("bonus_campaign_status");
  if (error) return { active: false } as CampaignStatus;
  return (data ?? { active: false }) as CampaignStatus;
});

/**
 * Called once per session after a successful login. Server-authoritative and
 * idempotent — concurrent calls, refreshes and extra devices cannot duplicate
 * an award (unique idempotency key + row lock inside `bonus_claim_for_user`).
 */
export const claimCampaignBonus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context;
    if ((claims as any)?.is_anonymous === true) {
      return { awarded: false, reason: "demo_account" } as BonusClaimResult;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc("bonus_claim_for_user", {
      p_user: userId,
    });
    if (error) return { awarded: false, reason: "error" } as BonusClaimResult;
    return (data ?? { awarded: false }) as BonusClaimResult;
  });

/** Trusted wallet split used by the wallet page and the cashout sheet. */
export const getMyWalletBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: wallet }, { data: pending }] = await Promise.all([
      supabase.from("wallets").select("balance, locked_bonus_balance").eq("user_id", userId).maybeSingle(),
      supabase
        .from("payout_requests")
        .select("amount, status")
        .eq("user_id", userId)
        .in("status", ["pending", "approved", "proof_uploaded"]),
    ]);

    const total = Number((wallet as any)?.balance ?? 0);
    const lockedBonus = Number((wallet as any)?.locked_bonus_balance ?? 0);
    const reserved = (pending ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    const withdrawable = Math.max(0, Math.round((total - lockedBonus - reserved) * 100) / 100);

    let blockReason: string | null = null;
    if (withdrawable < 100) blockReason = "You need at least 100 withdrawable points.";
    else if (total < 200) blockReason = "Your total wallet balance must be at least 200 points before withdrawing.";

    return {
      total,
      withdrawable,
      lockedBonus,
      reserved,
      canWithdraw: blockReason === null,
      minWithdrawable: 100,
      minTotal: 200,
      blockReason,
    } satisfies WalletBreakdown;
  });

/** Whether the award banner/modal has already been acknowledged server-side. */
export const getMyBonusEnrolment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("bonus_campaign_enrolments")
      .select("eligibility_group, slot_number, status, bonus_amount, remaining_locked_bonus, awarded_at")
      .eq("user_id", userId)
      .maybeSingle();
    return { enrolment: (data as any) ?? null };
  });
