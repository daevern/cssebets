import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (data ?? []).some((r: any) => r.role === "admin");
  if (!isAdmin) throw new Error("Admin only");
}

export const listUfcFights = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: event } = await (supabaseAdmin as any)
    .from("ufc_events")
    .select("id, event_key, name, starts_at")
    .eq("is_active", true)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!event) return { event: null, fights: [] };

  const { data: fights } = await (supabaseAdmin as any)
    .from("ufc_fights")
    .select("id, fighter_a, fighter_b, fighter_a_logo, fighter_b_logo, apimma_fighter_a_id, apimma_fighter_b_id, commence_time, card_position, scheduled_rounds, status, winner, result_method, result_round, weight_class, is_title_fight")
    .eq("event_id", event.id)
    .in("card_position", ["main", "co_main"])
    .order("commence_time", { ascending: true });

  const fightIds = (fights ?? []).map((f: any) => f.id);
  const fighterIds = Array.from(new Set(
    (fights ?? []).flatMap((f: any) => [f.apimma_fighter_a_id, f.apimma_fighter_b_id]).filter(Boolean),
  ));
  const [{ data: markets }, { data: fighters }] = await Promise.all([
    fightIds.length
      ? (supabaseAdmin as any)
          .from("ufc_fight_markets")
          .select("fight_id, market_type, selection_key, label, odds, is_active, updated_at")
          .in("fight_id", fightIds)
      : Promise.resolve({ data: [] as any[] }),
    fighterIds.length
      ? (supabaseAdmin as any)
          .from("ufc_fighters")
          .select("apimma_id, photo_url")
          .in("apimma_id", fighterIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const photoBy = new Map<number, string>();
  for (const f of (fighters ?? [])) if (f?.apimma_id && f.photo_url) photoBy.set(f.apimma_id, f.photo_url);

  const withMarkets = (fights ?? []).map((f: any) => ({
    ...f,
    fighter_a_logo: f.fighter_a_logo || photoBy.get(f.apimma_fighter_a_id) || null,
    fighter_b_logo: f.fighter_b_logo || photoBy.get(f.apimma_fighter_b_id) || null,
    markets: (markets ?? []).filter((m: any) => m.fight_id === f.id),
  }));

  return { event, fights: withMarkets };
});

export const getUfcMarketHistory = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ fightId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: rows } = await (supabaseAdmin as any)
      .from("ufc_market_snapshots")
      .select("market_type, selection_key, odds, sampled_at")
      .eq("fight_id", data.fightId)
      .gte("sampled_at", since)
      .order("sampled_at", { ascending: true });
    return { snapshots: rows ?? [] };
  });

export const getUfcFightDetail = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ fightId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: fight } = await (supabaseAdmin as any)
      .from("ufc_fights")
      .select("*")
      .eq("id", data.fightId)
      .maybeSingle();
    if (!fight) return { fight: null };

    const [{ data: markets }, { data: stats }, { data: h2h }, { data: fighterA }, { data: fighterB }, { data: event }] =
      await Promise.all([
        (supabaseAdmin as any).from("ufc_fight_markets").select("*").eq("fight_id", data.fightId),
        (supabaseAdmin as any).from("ufc_fight_stats").select("*").eq("fight_id", data.fightId),
        (supabaseAdmin as any)
          .from("ufc_fight_h2h")
          .select("*")
          .eq("fight_id", data.fightId)
          .order("date", { ascending: false }),
        (supabaseAdmin as any).from("ufc_fighters").select("*").eq("apimma_id", fight.apimma_fighter_a_id).maybeSingle(),
        (supabaseAdmin as any).from("ufc_fighters").select("*").eq("apimma_id", fight.apimma_fighter_b_id).maybeSingle(),
        (supabaseAdmin as any).from("ufc_events").select("id, name, starts_at").eq("id", fight.event_id).maybeSingle(),
      ]);

    return {
      fight,
      event,
      markets: markets ?? [],
      stats: stats ?? [],
      h2h: h2h ?? [],
      fighterA: fighterA ?? null,
      fighterB: fighterB ?? null,
    };
  });

export const listMyUfcBets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("ufc_bets" as any)
      .select("*")
      .eq("user_id", userId)
      .order("placed_at", { ascending: false })
      .limit(50);
    return { bets: data ?? [] };
  });

export const placeUfcBet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        fightId: z.string().uuid(),
        marketType: z.enum(["moneyline", "method", "round"]),
        selectionKey: z.string().min(1).max(32),
        stake: z.number().positive().max(10000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: market } = await (supabaseAdmin as any)
      .from("ufc_fight_markets")
      .select("odds, label, is_active")
      .eq("fight_id", data.fightId)
      .eq("market_type", data.marketType)
      .eq("selection_key", data.selectionKey)
      .maybeSingle();
    if (!market || !market.is_active) throw new Error("Market not available");

    const { data: betId, error } = await (supabaseAdmin as any).rpc("place_ufc_bet_atomic", {
      p_user_id: userId,
      p_fight_id: data.fightId,
      p_market_type: data.marketType,
      p_selection_key: data.selectionKey,
      p_selection_label: market.label,
      p_stake: data.stake,
      p_odds: market.odds,
    });
    if (error) throw new Error(error.message);
    return { betId, odds: market.odds, potentialPayout: Number((data.stake * market.odds).toFixed(2)) };
  });

// ---- Admin ----

export const adminSyncUfc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { runUfcOddsSync } = await import("@/lib/ufc-odds.server");
    return await runUfcOddsSync({ force: true });
  });

export const adminSetUfcCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        fightId: z.string().uuid(),
        fighterA: z.string().min(1).optional(),
        fighterB: z.string().min(1).optional(),
        cardPosition: z.enum(["main", "co_main", "other"]).optional(),
        scheduledRounds: z.union([z.literal(3), z.literal(5)]).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const update: any = {};
    if (data.fighterA) update.fighter_a = data.fighterA;
    if (data.fighterB) update.fighter_b = data.fighterB;
    if (data.cardPosition) update.card_position = data.cardPosition;
    if (data.scheduledRounds) update.scheduled_rounds = data.scheduledRounds;
    const { error } = await (supabaseAdmin as any).from("ufc_fights").update(update).eq("id", data.fightId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSettleUfcFight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        fightId: z.string().uuid(),
        winner: z.enum(["a", "b", "draw"]),
        method: z.enum(["ko_tko", "submission", "decision"]),
        round: z.number().int().min(1).max(5),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settled, error } = await (supabaseAdmin as any).rpc("settle_ufc_fight_atomic", {
      p_fight_id: data.fightId,
      p_winner: data.winner,
      p_method: data.method,
      p_round: data.round,
    });
    if (error) throw new Error(error.message);
    await (supabaseAdmin as any).from("audit_log").insert({
      user_id: context.userId,
      action: "ufc.settle",
      entity: "ufc_fights",
      entity_id: data.fightId,
      metadata: { winner: data.winner, method: data.method, round: data.round, settled },
    });
    return { ok: true, settled };
  });

export const adminVoidUfcFight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ fightId: z.string().uuid(), reason: z.string().max(200).default("") }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: voided, error } = await (supabaseAdmin as any).rpc("void_ufc_fight_atomic", {
      p_fight_id: data.fightId,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    await (supabaseAdmin as any).from("audit_log").insert({
      user_id: context.userId,
      action: "ufc.void",
      entity: "ufc_fights",
      entity_id: data.fightId,
      metadata: { reason: data.reason, voided },
    });
    return { ok: true, voided };
  });

export const adminUpdateUfcEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        eventKey: z.string().min(1),
        name: z.string().min(1).optional(),
        startsAt: z.string().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const update: any = {};
    if (data.name) update.name = data.name;
    if (data.startsAt) update.starts_at = data.startsAt;
    if (typeof data.isActive === "boolean") update.is_active = data.isActive;
    const { error } = await (supabaseAdmin as any).from("ufc_events").update(update).eq("event_key", data.eventKey);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listUfcBetsForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ fightId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bets } = await (supabaseAdmin as any)
      .from("ufc_bets")
      .select("*")
      .eq("fight_id", data.fightId)
      .order("placed_at", { ascending: false });
    return { bets: bets ?? [] };
  });
