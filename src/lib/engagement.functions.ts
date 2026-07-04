import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LEVELS = [
  { level: 1, min: 0,    label: "Rookie" },
  { level: 2, min: 500,  label: "Contender" },
  { level: 3, min: 2500, label: "Sharpshooter" },
  { level: 4, min: 10000, label: "Champion" },
  { level: 5, min: 50000, label: "Legend" },
] as const;

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (data ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
  if (!isAdmin) throw new Error("Forbidden");
}

export const getMyEngagementSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: w } = await (supabase as any)
      .from("csse_token_wallets")
      .select("balance, lifetime_earned, lifetime_spent")
      .eq("user_id", userId).maybeSingle();
    const wallet = w ?? { balance: 0, lifetime_earned: 0, lifetime_spent: 0 };
    const lifetime = Number(wallet.lifetime_earned ?? 0);
    let level: (typeof LEVELS)[number] = LEVELS[0];
    for (const l of LEVELS) if (lifetime >= l.min) level = l;
    return {
      tokens: {
        balance: Number(wallet.balance ?? 0),
        lifetime_earned: Number(wallet.lifetime_earned ?? 0),
        lifetime_spent: Number(wallet.lifetime_spent ?? 0),
      },
      level,
      levels: LEVELS,
      canClaimToday: false,
    };
  });

// Legacy stub; kept so any lingering callers don't crash.
export const claimDailyReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ disabled: true as const }));

export const listMyTokenTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as any)
      .from("csse_token_transactions")
      .select("id, delta, kind, source, source_ref, metadata, balance_after, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export const adminGrantTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    userId: z.string().uuid(),
    amount: z.number().int(),
    reason: z.string().min(3).max(500),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await (supabase as any).rpc("admin_grant_tokens", {
      p_user_id: data.userId,
      p_amount: data.amount,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListStoreItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data } = await (supabase as any)
      .from("csse_store_items").select("*").order("sort_order", { ascending: true });
    return data ?? [];
  });

export const adminUpsertStoreItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid().optional(),
    item_key: z.string().min(1).max(50),
    kind: z.literal("free_bet"),
    label: z.string().min(1).max(80),
    stake_amount: z.number().positive(),
    token_price: z.number().int().nonnegative(),
    is_active: z.boolean(),
    sort_order: z.number().int().default(0),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    if (data.id) {
      const { error } = await (supabase as any).from("csse_store_items").update({
        item_key: data.item_key, label: data.label, stake_amount: data.stake_amount,
        token_price: data.token_price, is_active: data.is_active, sort_order: data.sort_order,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await (supabase as any).from("csse_store_items").insert({
        item_key: data.item_key, kind: data.kind, label: data.label,
        stake_amount: data.stake_amount, token_price: data.token_price,
        is_active: data.is_active, sort_order: data.sort_order,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminDeleteStoreItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await (supabase as any).from("csse_store_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListTokenLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    kind: z.string().optional(),
    source: z.string().optional(),
    userId: z.string().uuid().optional(),
    limit: z.number().int().positive().max(1000).default(500),
  }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = (supabaseAdmin as any)
      .from("csse_token_transactions")
      .select("id, user_id, delta, kind, source, source_ref, metadata, balance_after, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.source) q = q.eq("source", data.source);
    if (data.userId) q = q.eq("user_id", data.userId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set(((rows ?? []) as any[]).map((r) => r.user_id)));
    const { data: profs } = ids.length
      ? await (supabaseAdmin as any).from("profiles").select("id, display_name").in("id", ids)
      : { data: [] };
    const names = new Map(((profs ?? []) as any[]).map((p) => [p.id, p.display_name]));
    const totals = { credit: 0, debit: 0 };
    for (const r of (rows ?? []) as any[]) {
      const n = Number(r.delta ?? 0);
      if (n >= 0) totals.credit += n; else totals.debit += -n;
    }
    return {
      transactions: ((rows ?? []) as any[]).map((r) => ({
        ...r,
        display_name: names.get(r.user_id) ?? "—",
      })),
      totals,
    };
  });

export const adminListReferredUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    search: z.string().optional(),
    limit: z.number().int().positive().max(1000).default(500),
  }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // New users who signed up via a referral code
    let q = (supabaseAdmin as any)
      .from("profiles")
      .select("id, display_name, referred_by_code, referral_code, created_at")
      .not("referred_by_code", "is", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.search) q = q.ilike("display_name", `%${data.search}%`);
    const { data: newUsers, error } = await q;
    if (error) throw new Error(error.message);

    const codes = Array.from(new Set(((newUsers ?? []) as any[])
      .map((u) => (u.referred_by_code || "").toUpperCase())
      .filter(Boolean)));
    const referrerByCode = new Map<string, { id: string; display_name: string }>();
    if (codes.length) {
      const { data: refs } = await (supabaseAdmin as any)
        .from("profiles").select("id, display_name, referral_code").in("referral_code", codes);
      for (const r of (refs ?? []) as any[]) {
        referrerByCode.set(String(r.referral_code).toUpperCase(), { id: r.id, display_name: r.display_name });
      }
    }

    // Bring in referrals row for milestone/tokens context
    const newUserIds = ((newUsers ?? []) as any[]).map((u) => u.id);
    const { data: refRows } = newUserIds.length
      ? await (supabaseAdmin as any)
          .from("referrals")
          .select("referred_user_id, stage1_completed, stage2_completed, stage3_completed, total_tokens_awarded, cumulative_settled_wagered, flagged")
          .in("referred_user_id", newUserIds)
      : { data: [] };
    const refByUser = new Map(((refRows ?? []) as any[]).map((r) => [r.referred_user_id, r]));

    const rows = ((newUsers ?? []) as any[]).map((u) => {
      const code = (u.referred_by_code || "").toUpperCase();
      const referrer = referrerByCode.get(code);
      const rr = refByUser.get(u.id);
      return {
        id: u.id,
        display_name: u.display_name,
        created_at: u.created_at,
        referred_by_code: code,
        referrer_id: referrer?.id ?? null,
        referrer_name: referrer?.display_name ?? "—",
        stage1: !!rr?.stage1_completed,
        stage2: !!rr?.stage2_completed,
        stage3: !!rr?.stage3_completed,
        tokens_awarded: Number(rr?.total_tokens_awarded ?? 0),
        wagered: Number(rr?.cumulative_settled_wagered ?? 0),
        flagged: !!rr?.flagged,
      };
    });

    const stats = {
      total: rows.length,
      uniqueReferrers: new Set(rows.map((r) => r.referrer_id).filter(Boolean)).size,
      active: rows.filter((r) => r.stage1).length,
      tokensAwarded: rows.reduce((a, b) => a + b.tokens_awarded, 0),
    };

    return { rows, stats };
  });

