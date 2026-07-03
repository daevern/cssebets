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
