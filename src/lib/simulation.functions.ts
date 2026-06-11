// Simulation Mode — TEST DATA ONLY.
// Creates fake users, matches, predictions; auto-settles via tick.
// Do not use shared passwords outside local/test simulation environments.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SIM_PASSWORD = "123456789";
const SIM_USER_COUNT = 100;
const SIM_MATCH_COUNT = 25;
const SIM_STARTING_BALANCE = 10_000;
const SIM_BANKROLL_START = 1_000_000;
const SIM_MATCH_DURATION_MIN = 1;
const SIM_INTERVAL_MIN = 1;

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!roles.some((r: string) => ["admin", "super_admin"].includes(r))) {
    throw new Error("Admin only");
  }
}

const SIM_EMAIL_DOMAIN = "test.local";
function simEmail(i: number) {
  return `simuser${String(i).padStart(3, "0")}@${SIM_EMAIL_DOMAIN}`;
}
function simName(i: number) {
  return `Sim User ${String(i).padStart(3, "0")}`;
}

const SIM_TEAMS = [
  "Red Lions FC", "Blue Tigers FC", "North City", "South United",
  "Riverdale FC", "Mountain Rangers", "Eastport", "Westbridge",
  "Silver Eagles", "Golden Wolves", "Iron Bears", "Crystal Hawks",
  "Royal Stags", "Phoenix Athletic", "Atlas Rovers", "Comet City",
  "Harbor United", "Granite FC", "Sunset Sharks", "Aurora FC",
  "Polar Foxes", "Desert Falcons", "Velvet Bulls", "Storm Wanderers",
  "Onyx FC", "Emerald City", "Cobalt Tigers", "Crimson Stars",
  "Pine Valley", "Lakeside FC", "Skyline Athletic", "Vanguard United",
  "Marble United", "Twin Peaks FC", "Echo Bay", "Frostfire FC",
  "Thunder Coast", "Coral Reef FC", "Glacier Athletic", "Magma Rovers",
  "Stoneheart FC", "Sapphire Sun", "Highlanders FC", "Borealis United",
  "Cypress FC", "Driftwood FC", "Quicksilver City", "Obsidian FC",
  "Lantern FC", "Beacon United",
];

// =========================================================
//  SEED users (idempotent, batched)
// =========================================================
export const seedSimulationUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      start: z.number().int().min(1).default(1),
      count: z.number().int().min(1).max(50).default(25),
      totalUsers: z.number().int().min(1).max(500).default(SIM_USER_COUNT),
      startingBalance: z.number().int().min(0).default(SIM_STARTING_BALANCE),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const end = Math.min(data.start + data.count - 1, data.totalUsers);
    let created = 0;
    let skipped = 0;
    const createdIds: string[] = [];

    for (let i = data.start; i <= end; i++) {
      const email = simEmail(i);
      const name = simName(i);

      const { data: existingProfile } = await (supabaseAdmin as any)
        .from("profiles").select("id, is_simulation").eq("display_name", name).maybeSingle();
      if (existingProfile?.id) {
        if (!existingProfile.is_simulation) {
          await (supabaseAdmin as any).from("profiles").update({ is_simulation: true }).eq("id", existingProfile.id);
        }
        await ensureSimWallet(supabaseAdmin, existingProfile.id, data.startingBalance);
        createdIds.push(existingProfile.id);
        skipped++;
        continue;
      }

      const { data: createdUser, error: createErr } = await (supabaseAdmin as any).auth.admin.createUser({
        email,
        password: SIM_PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: name, simulation: true },
      });
      if (createErr) { console.error("simseed user err", email, createErr.message); skipped++; continue; }
      const uid = createdUser?.user?.id;
      if (!uid) { skipped++; continue; }

      await (supabaseAdmin as any).from("profiles")
        .update({ display_name: name, is_simulation: true }).eq("id", uid);
      await (supabaseAdmin as any).from("user_roles")
        .upsert({ user_id: uid, role: "member" }, { onConflict: "user_id,role" });
      await (supabaseAdmin as any).from("user_roles")
        .delete().eq("user_id", uid).eq("role", "pending");

      await ensureSimWallet(supabaseAdmin, uid, data.startingBalance);
      createdIds.push(uid);
      created++;
    }

    return { created, skipped, processedRange: [data.start, end], done: end >= data.totalUsers };
  });

async function ensureSimWallet(supabaseAdmin: any, uid: string, startingBalance: number = SIM_STARTING_BALANCE) {
  await supabaseAdmin.from("wallets")
    .upsert({ user_id: uid, is_simulation: true }, { onConflict: "user_id" });
  const { data: w } = await supabaseAdmin.from("wallets").select("balance").eq("user_id", uid).maybeSingle();
  const bal = Number(w?.balance ?? 0);
  if (bal < startingBalance) {
    const topup = startingBalance - bal;
    await supabaseAdmin.rpc("wallet_apply_change", {
      p_user_id: uid,
      p_type: "credit",
      p_amount: topup,
      p_reference_type: "admin_adjustment",
      p_reference_id: null,
      p_note: "Simulation starting balance",
      p_is_simulation: true,
    });
  }
}

// Set / reset the simulation bankroll to a specific value
export const setSimulationBankroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ balance: z.number().min(0) }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("platform_bankroll")
      .upsert({ id: 2, balance: data.balance, updated_at: new Date().toISOString() }, { onConflict: "id" });
    return { balance: data.balance };
  });

// =========================================================
//  SEED matches (creates 25 staggered scheduled sim matches)
// =========================================================
export const seedSimulationMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // skip if already seeded this batch
    const { count } = await (supabaseAdmin as any).from("matches")
      .select("id", { count: "exact", head: true })
      .eq("is_simulation", true)
      .in("status", ["scheduled", "live"]);
    if ((count ?? 0) >= SIM_MATCH_COUNT) {
      return { created: 0, skipped: count, message: "Already seeded" };
    }

    const now = Date.now();
    const rows: any[] = [];
    const usedTeams = new Set<string>();
    let teamIdx = 0;
    for (let i = 0; i < SIM_MATCH_COUNT; i++) {
      let home = SIM_TEAMS[teamIdx++ % SIM_TEAMS.length];
      let away = SIM_TEAMS[teamIdx++ % SIM_TEAMS.length];
      while (usedTeams.has(home + away) || home === away) {
        away = SIM_TEAMS[teamIdx++ % SIM_TEAMS.length];
      }
      usedTeams.add(home + away);
      const kickoff = new Date(now + i * SIM_INTERVAL_MIN * 60_000).toISOString();
      const homeOdds = +(1.5 + Math.random() * 3).toFixed(2);
      const drawOdds = +(2.8 + Math.random() * 2.2).toFixed(2);
      const awayOdds = +(1.5 + Math.random() * 3).toFixed(2);
      rows.push({
        home_team: home,
        away_team: away,
        kickoff_at: kickoff,
        status: "scheduled",
        stage: "Simulation Cup",
        is_simulation: true,
        reference_odds: { home: homeOdds, draw: drawOdds, away: awayOdds },
      });
    }

    const { data: inserted, error } = await (supabaseAdmin as any)
      .from("matches").insert(rows).select("id, reference_odds");
    if (error) throw new Error(error.message);

    // odds snapshots
    const snaps = (inserted ?? []).map((m: any) => ({
      match_id: m.id,
      home_odds: m.reference_odds?.home,
      draw_odds: m.reference_odds?.draw,
      away_odds: m.reference_odds?.away,
      source: "simulation",
      sampled_at: new Date().toISOString(),
    }));
    if (snaps.length) {
      await (supabaseAdmin as any).from("match_odds_snapshots").insert(snaps);
    }
    return { created: inserted?.length ?? 0 };
  });

// =========================================================
//  SEED random predictions for all scheduled sim matches
// =========================================================
export const seedSimulationPredictions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: users } = await (supabaseAdmin as any)
      .from("profiles").select("id").eq("is_simulation", true);
    const userIds: string[] = (users ?? []).map((u: any) => u.id);
    if (!userIds.length) return { error: "No sim users — seed users first" };

    const { data: matches } = await (supabaseAdmin as any)
      .from("matches")
      .select("id, reference_odds")
      .eq("is_simulation", true)
      .eq("status", "scheduled");

    if (!matches?.length) return { error: "No scheduled sim matches" };

    let predictionsCreated = 0;
    let predictionsFailed = 0;

    for (const m of matches as any[]) {
      // skip if predictions already exist for this match
      const { count: existing } = await (supabaseAdmin as any).from("predictions")
        .select("id", { count: "exact", head: true })
        .eq("match_id", m.id);
      if ((existing ?? 0) > 0) continue;

      const ro = m.reference_odds ?? { home: 2, draw: 3, away: 2 };
      // randomly select 30-80 users
      const pickN = 30 + Math.floor(Math.random() * 51);
      const shuffled = [...userIds].sort(() => Math.random() - 0.5).slice(0, pickN);

      for (const uid of shuffled) {
        const r = Math.random();
        const outcome = r < 0.4 ? "HOME" : r < 0.7 ? "AWAY" : "DRAW";
        const odds = outcome === "HOME" ? ro.home : outcome === "DRAW" ? ro.draw : ro.away;
        const stake = 50 + Math.floor(Math.random() * 951);

        const { error: betErr } = await (supabaseAdmin as any).rpc("place_bet_atomic", {
          p_user_id: uid,
          p_match_id: m.id,
          p_market: "result",
          p_outcome: outcome,
          p_odds: odds,
          p_stake: stake,
          p_snapshot_id: null,
        });
        if (betErr) predictionsFailed++;
        else predictionsCreated++;
      }
    }
    return { predictionsCreated, predictionsFailed, matchesProcessed: matches.length };
  });

// =========================================================
//  TICK — advances scheduled/live sim matches; settles due
// =========================================================
export const runSimulationTick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      durationMinutes: z.number().int().min(1).max(60).default(SIM_MATCH_DURATION_MIN),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await (supabaseAdmin as any).rpc("run_simulation_tick", {
      p_match_duration_minutes: data.durationMinutes,
    });
    if (error) throw new Error(error.message);
    return result;
  });

// =========================================================
//  RESET — wipes only is_simulation rows (keeps auth users)
// =========================================================
export const resetSimulationData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc("reset_simulation_data", {
      p_admin_id: context.userId,
    });
    if (error) throw new Error(error.message);

    // re-top-up all sim user wallets back to starting balance
    const { data: users } = await (supabaseAdmin as any)
      .from("profiles").select("id").eq("is_simulation", true);
    for (const u of users ?? []) {
      await ensureSimWallet(supabaseAdmin, u.id);
    }
    return { deleted: data };
  });

// =========================================================
//  OVERVIEW — sim dashboard cards
// =========================================================
export const getSimulationOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      { data: bankroll },
      { count: userCount },
      { data: matches },
      { count: predCount },
      { data: pools },
      { data: walletTxns },
    ] = await Promise.all([
      (supabaseAdmin as any).from("platform_bankroll").select("*").eq("id", 2).maybeSingle(),
      (supabaseAdmin as any).from("profiles").select("id", { count: "exact", head: true }).eq("is_simulation", true),
      (supabaseAdmin as any).from("matches").select("id, status, worst_case_exposure").eq("is_simulation", true),
      (supabaseAdmin as any).from("predictions").select("id", { count: "exact", head: true }).eq("is_simulation", true),
      (supabaseAdmin as any).from("match_stake_pools").select("total_pool, settled").eq("is_simulation", true),
      (supabaseAdmin as any).from("wallet_transactions").select("user_id, type, amount").eq("is_simulation", true),
    ]);

    const balance = Number((bankroll as any)?.balance ?? 0);
    const totalStakes = Number((bankroll as any)?.total_stakes_collected ?? 0);
    const totalPayouts = Number((bankroll as any)?.total_payouts_paid ?? 0);
    const netPL = totalStakes - totalPayouts;
    const globalExposure = (matches ?? []).filter((m: any) => ["scheduled", "live"].includes(m.status))
      .reduce((s: number, m: any) => s + Number(m.worst_case_exposure || 0), 0);
    const availableBalance = balance - globalExposure;
    const safetyRatio = globalExposure > 0 ? balance / globalExposure : null;
    const pendingPools = (pools ?? []).filter((p: any) => !p.settled).reduce((s: number, p: any) => s + Number(p.total_pool || 0), 0);
    const settledPools = (pools ?? []).filter((p: any) => p.settled).length;

    const byStatus = { scheduled: 0, live: 0, finished: 0, cancelled: 0 };
    for (const m of matches ?? []) byStatus[m.status as keyof typeof byStatus] = (byStatus[m.status as keyof typeof byStatus] ?? 0) + 1;

    // per-user P/L for highest/lowest
    const userPL = new Map<string, number>();
    for (const t of walletTxns ?? []) {
      const sign = ["credit", "refund"].includes(t.type) ? 1 : -1;
      // ignore the starting-balance credit (admin_adjustment) so P/L reflects betting only
      userPL.set(t.user_id, (userPL.get(t.user_id) ?? 0) + sign * Number(t.amount));
    }
    // remove starting balance influence: subtract starting credit
    for (const uid of userPL.keys()) {
      userPL.set(uid, (userPL.get(uid) ?? 0) - SIM_STARTING_BALANCE);
    }
    let topWin: { user_id: string; pl: number } | null = null;
    let topLoss: { user_id: string; pl: number } | null = null;
    for (const [uid, pl] of userPL.entries()) {
      if (!topWin || pl > topWin.pl) topWin = { user_id: uid, pl };
      if (!topLoss || pl < topLoss.pl) topLoss = { user_id: uid, pl };
    }
    const lookup: string[] = [];
    if (topWin) lookup.push(topWin.user_id);
    if (topLoss) lookup.push(topLoss.user_id);
    const profMap: Record<string, string> = {};
    if (lookup.length) {
      const { data: profs } = await (supabaseAdmin as any).from("profiles").select("id, display_name").in("id", lookup);
      for (const p of profs ?? []) profMap[p.id] = p.display_name;
    }

    return {
      bankroll: {
        balance, totalStakes, totalPayouts, netPL,
        globalExposure, availableBalance, safetyRatio,
        pendingPools, settledPools,
      },
      users: { total: userCount ?? 0 },
      matches: { total: matches?.length ?? 0, ...byStatus },
      predictions: { total: predCount ?? 0 },
      highestWinner: topWin ? { displayName: profMap[topWin.user_id] ?? topWin.user_id.slice(0, 8), pl: topWin.pl } : null,
      lowestLoser: topLoss ? { displayName: profMap[topLoss.user_id] ?? topLoss.user_id.slice(0, 8), pl: topLoss.pl } : null,
    };
  });

// =========================================================
//  Simulation users list (admin)
// =========================================================
export const getSimulationUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profs } = await (supabaseAdmin as any)
      .from("profiles").select("id, display_name").eq("is_simulation", true).order("display_name");
    const ids: string[] = (profs ?? []).map((p: any) => p.id);
    if (!ids.length) return { users: [] };

    const [{ data: wallets }, { data: preds }, { data: walletTxns }] = await Promise.all([
      (supabaseAdmin as any).from("wallets").select("user_id, balance, updated_at").in("user_id", ids),
      (supabaseAdmin as any).from("predictions").select("user_id").in("user_id", ids).eq("is_simulation", true),
      (supabaseAdmin as any).from("wallet_transactions").select("user_id, type, amount").in("user_id", ids).eq("is_simulation", true),
    ]);
    const wMap = new Map((wallets ?? []).map((w: any) => [w.user_id, w]));
    const predCount = new Map<string, number>();
    for (const p of preds ?? []) predCount.set(p.user_id, (predCount.get(p.user_id) ?? 0) + 1);
    const plMap = new Map<string, number>();
    for (const t of walletTxns ?? []) {
      const sign = ["credit", "refund"].includes(t.type) ? 1 : -1;
      plMap.set(t.user_id, (plMap.get(t.user_id) ?? 0) + sign * Number(t.amount));
    }
    return {
      users: (profs ?? []).map((p: any, idx: number) => ({
        id: p.id,
        displayName: p.display_name,
        email: simEmail(idx + 1),
        password: SIM_PASSWORD,
        balance: Number((wMap.get(p.id) as any)?.balance ?? 0),
        predictionCount: predCount.get(p.id) ?? 0,
        profitLoss: (plMap.get(p.id) ?? 0) - SIM_STARTING_BALANCE,
        lastActivity: (wMap.get(p.id) as any)?.updated_at ?? null,
      })),
    };
  });

// =========================================================
//  Simulation matches list
// =========================================================
export const getSimulationMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: matches } = await (supabaseAdmin as any)
      .from("matches")
      .select("id, home_team, away_team, kickoff_at, status, reference_odds, home_score, away_score, home_liability, draw_liability, away_liability, worst_case_exposure")
      .eq("is_simulation", true)
      .order("kickoff_at");
    const ids = (matches ?? []).map((m: any) => m.id);
    const pools = ids.length
      ? (await (supabaseAdmin as any).from("match_stake_pools").select("*").in("match_id", ids)).data ?? []
      : [];
    const pMap = new Map((pools as any[]).map((p) => [p.match_id, p]));

    // payouts per match
    const payoutsByMatch = new Map<string, number>();
    if (ids.length) {
      const { data: payTxns } = await (supabaseAdmin as any)
        .from("platform_transactions")
        .select("match_id, amount")
        .in("match_id", ids)
        .eq("transaction_type", "payout_paid");
      for (const t of payTxns ?? []) payoutsByMatch.set(t.match_id, (payoutsByMatch.get(t.match_id) ?? 0) + Number(t.amount));
    }

    return {
      matches: (matches ?? []).map((m: any) => {
        const pool = pMap.get(m.id) as any;
        const totalPool = Number(pool?.total_pool ?? 0);
        const payouts = payoutsByMatch.get(m.id) ?? 0;
        return {
          id: m.id,
          label: `${m.home_team} vs ${m.away_team}`,
          kickoff: m.kickoff_at,
          status: m.status,
          odds: m.reference_odds,
          totalPool,
          homePool: Number(pool?.home_pool ?? 0),
          drawPool: Number(pool?.draw_pool ?? 0),
          awayPool: Number(pool?.away_pool ?? 0),
          worst: Number(m.worst_case_exposure ?? 0),
          finalScore: m.status === "finished" ? `${m.home_score}-${m.away_score}` : null,
          payouts,
          profitLoss: (pool?.settled ? totalPool : 0) - payouts,
        };
      }),
    };
  });
