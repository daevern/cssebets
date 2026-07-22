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
  // Always derive the featured event from the latest event date so a stale
  // still-active row from a prior card can never win the selection. We pick
  // the row with the greatest starts_at and fall back to any active row only
  // if nothing has a scheduled date yet.
  const { data: events } = await (supabaseAdmin as any)
    .from("ufc_events")
    .select("id, event_key, name, starts_at, is_active")
    .eq("is_active", true)
    .order("starts_at", { ascending: false, nullsFirst: false })
    .limit(1);
  const event = (events ?? [])[0] ?? null;
  if (!event) return { event: null, fights: [] };


  // Only include fights within the event's window (event day ± 12h).
  // Prevents stale fights from prior events (same event row reused by sync)
  // from leaking into the card.
  const eventStartMs = new Date(event.starts_at).getTime();
  const windowStart = new Date(eventStartMs - 12 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(eventStartMs + 24 * 60 * 60 * 1000).toISOString();

  const { data: fights } = await (supabaseAdmin as any)
    .from("ufc_fights")
    .select("id, fighter_a, fighter_b, fighter_a_logo, fighter_b_logo, apimma_fighter_a_id, apimma_fighter_b_id, commence_time, card_position, scheduled_rounds, status, winner, result_method, result_round, weight_class, is_title_fight")
    .eq("event_id", event.id)
    .gte("commence_time", windowStart)
    .lte("commence_time", windowEnd)
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
          .select("apimma_id, photo_url, country")
          .in("apimma_id", fighterIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const photoBy = new Map<number, string>();
  const countryBy = new Map<number, string>();
  for (const f of (fighters ?? [])) {
    if (f?.apimma_id && f.photo_url) photoBy.set(f.apimma_id, f.photo_url);
    if (f?.apimma_id && f.country) countryBy.set(f.apimma_id, f.country);
  }

  const withMarkets = (fights ?? []).map((f: any) => ({
    ...f,
    fighter_a_logo: f.fighter_a_logo || photoBy.get(f.apimma_fighter_a_id) || null,
    fighter_b_logo: f.fighter_b_logo || photoBy.get(f.apimma_fighter_b_id) || null,
    fighter_a_country: countryBy.get(f.apimma_fighter_a_id) || null,
    fighter_b_country: countryBy.get(f.apimma_fighter_b_id) || null,
    markets: (markets ?? []).filter((m: any) => m.fight_id === f.id),
  }));

  return { event, fights: withMarkets };
});

export const listUfcFightsAll = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();
  const past = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const future = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString();

  const { data: fights } = await (supabaseAdmin as any)
    .from("ufc_fights")
    .select("id, event_id, fighter_a, fighter_b, fighter_a_logo, fighter_b_logo, apimma_fighter_a_id, apimma_fighter_b_id, commence_time, card_position, scheduled_rounds, status, weight_class, is_title_fight")
    .gte("commence_time", past)
    .lte("commence_time", future)
    .in("card_position", ["main", "co_main"])
    .order("commence_time", { ascending: true });

  const fightIds = (fights ?? []).map((f: any) => f.id);
  const eventIds = Array.from(new Set((fights ?? []).map((f: any) => f.event_id).filter(Boolean)));
  const fighterIds = Array.from(new Set(
    (fights ?? []).flatMap((f: any) => [f.apimma_fighter_a_id, f.apimma_fighter_b_id]).filter(Boolean),
  ));

  const [{ data: markets }, { data: events }, { data: fighters }] = await Promise.all([
    fightIds.length
      ? (supabaseAdmin as any)
          .from("ufc_fight_markets")
          .select("fight_id, market_type, selection_key, odds, is_active")
          .eq("market_type", "moneyline")
          .in("fight_id", fightIds)
      : Promise.resolve({ data: [] as any[] }),
    eventIds.length
      ? (supabaseAdmin as any).from("ufc_events").select("id, name, starts_at").in("id", eventIds)
      : Promise.resolve({ data: [] as any[] }),
    fighterIds.length
      ? (supabaseAdmin as any).from("ufc_fighters").select("apimma_id, photo_url, country").in("apimma_id", fighterIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const eventBy = new Map<string, any>();
  for (const e of (events ?? [])) eventBy.set(e.id, e);
  const photoBy = new Map<number, string>();
  const countryBy = new Map<number, string>();
  for (const f of (fighters ?? [])) {
    if (f?.apimma_id && f.photo_url) photoBy.set(f.apimma_id, f.photo_url);
    if (f?.apimma_id && f.country) countryBy.set(f.apimma_id, f.country);
  }

  const out = (fights ?? []).map((f: any) => {
    const ev = eventBy.get(f.event_id);
    return {
      ...f,
      event_name: ev?.name ?? null,
      fighter_a_logo: f.fighter_a_logo || photoBy.get(f.apimma_fighter_a_id) || null,
      fighter_b_logo: f.fighter_b_logo || photoBy.get(f.apimma_fighter_b_id) || null,
      fighter_a_country: countryBy.get(f.apimma_fighter_a_id) || null,
      fighter_b_country: countryBy.get(f.apimma_fighter_b_id) || null,
      markets: (markets ?? []).filter((m: any) => m.fight_id === f.id),
    };
  });

  return { fights: out, now: nowIso };
});

export const getUfcMarketHistory = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ fightId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
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
        marketType: z.enum(["moneyline", "three_way", "method", "round", "total_rounds", "distance", "handicap"]),
        selectionKey: z.string().min(1).max(32),
        stake: z.number().positive().min(10).max(50000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Method-of-victory market locks 30 minutes before commence_time so we
    // never accept bets against stale synthetic prices near walk-outs.
    if (data.marketType === "method") {
      const { data: f } = await (supabaseAdmin as any)
        .from("ufc_fights").select("commence_time").eq("id", data.fightId).maybeSingle();
      const commenceMs = f?.commence_time ? new Date(f.commence_time).getTime() : 0;
      if (commenceMs && (commenceMs - Date.now()) <= 30 * 60 * 1000) {
        throw new Error("Method of Victory market is closed (locks 30 minutes before the fight).");
      }
    }

    const { data: market } = await (supabaseAdmin as any)
      .from("ufc_fight_markets")
      .select("odds, label, is_active")
      .eq("fight_id", data.fightId)
      .eq("market_type", data.marketType)
      .eq("selection_key", data.selectionKey)
      .maybeSingle();
    if (!market || !market.is_active) throw new Error("This market is no longer available. Please pick another.");


    const { data: betId, error } = await (supabaseAdmin as any).rpc("place_ufc_bet_atomic", {
      p_user_id: userId,
      p_fight_id: data.fightId,
      p_market_type: data.marketType,
      p_selection_key: data.selectionKey,
      p_selection_label: market.label,
      p_stake: data.stake,
      p_odds: market.odds,
    });
    if (error) {
      const msg = error.message ?? "";
      if (/DUPLICATE_SELECTION/i.test(msg)) throw new Error("You already have an open bet on this selection. Cash it out or wait for it to settle before betting again.");
      if (/Insufficient balance/i.test(msg)) throw new Error("Insufficient points balance. Top up to place this bet.");
      if (/Wallet not found/i.test(msg)) throw new Error("Your wallet isn't ready yet. Please refresh and try again.");
      if (/Fight not open/i.test(msg)) throw new Error("This fight is no longer open for betting.");
      if (/Fight not found/i.test(msg)) throw new Error("Fight not found.");
      if (/Market not available/i.test(msg)) throw new Error("This market is no longer available. Please pick another.");
      if (/Invalid odds|Stake must be positive/i.test(msg)) throw new Error("Invalid stake or odds. Please try again.");
      throw new Error("Could not place bet. Please try again.");
    }
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

// Void a single UFC bet (mirrors voidPredictionAdmin for football).
export const voidUfcBetAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      betId: z.string().uuid(),
      reason: z.string().trim().min(3).max(500),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await (supabaseAdmin as any).rpc("void_ufc_bet_manual", {
      p_bet_id: data.betId,
      p_actor_id: context.userId,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    await (supabaseAdmin as any).from("audit_log").insert({
      user_id: context.userId,
      action: "ufc_bet.void",
      entity: "ufc_bet",
      entity_id: data.betId,
      reason: data.reason,
      metadata: result,
    });
    return { ok: true, ...(result as any) };
  });

// Regrade a single UFC bet to won/lost/void/pending (open) with wallet delta.
export const regradeUfcBetAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      betId: z.string().uuid(),
      newStatus: z.enum(["won", "lost", "void", "pending"]),
      reason: z.string().trim().min(3).max(500),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Map UI "pending" -> ufc_bets "open".
    const target = data.newStatus === "pending" ? "open" : data.newStatus;
    const { data: result, error } = await (supabaseAdmin as any).rpc("regrade_ufc_bet_manual", {
      p_bet_id: data.betId,
      p_new_status: target,
      p_actor_id: context.userId,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    await (supabaseAdmin as any).from("audit_log").insert({
      user_id: context.userId,
      action: "ufc_bet.regrade",
      entity: "ufc_bet",
      entity_id: data.betId,
      reason: data.reason,
      metadata: result,
    });
    return { ok: true, ...(result as any) };
  });

// Per-fight margin disable toggle (mirrors setMatchMarginDisabled for football).
export const setUfcFightMarginDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      fightId: z.string().uuid(),
      disabled: z.boolean(),
      reason: z.string().trim().min(3).max(500),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: old } = await (supabaseAdmin as any)
      .from("ufc_fights").select("margin_disabled").eq("id", data.fightId).maybeSingle();
    const { error } = await (supabaseAdmin as any)
      .from("ufc_fights").update({ margin_disabled: data.disabled }).eq("id", data.fightId);
    if (error) throw new Error(error.message);
    await (supabaseAdmin as any).from("audit_log").insert({
      user_id: context.userId,
      action: "ufc_fight.margin_disabled",
      entity: "ufc_fights",
      entity_id: data.fightId,
      old_value: { margin_disabled: !!old?.margin_disabled },
      new_value: { margin_disabled: data.disabled },
      reason: data.reason,
    });
    return { ok: true };
  });


// Anonymised recent bets for a fight (privacy-safe live tape).
export const getUfcTradeTape = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ fightId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data: rows } = await (supabaseAdmin as any)
      .from("ufc_bets")
      .select("id, market_type, selection_label, stake, odds_locked, created_at")
      .eq("fight_id", data.fightId)
      .gt("created_at", since)
      .order("created_at", { ascending: false })
      .limit(25);
    // Bucket stake for privacy: S / M / L / XL
    const bucket = (v: number) => (v < 100 ? "S" : v < 500 ? "M" : v < 2000 ? "L" : "XL");
    return {
      trades: (rows ?? []).map((r: any) => ({
        id: r.id,
        market: r.market_type,
        selection: r.selection_label,
        stakeBucket: bucket(Number(r.stake)),
        odds: Number(r.odds_locked),
        placedAt: r.created_at,
      })),
    };
  });
