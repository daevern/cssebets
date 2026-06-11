// Simulation Mode — TEST DATA ONLY.
// Creates fake users, matches, predictions; auto-settles via tick.
// Do not use shared passwords outside local/test simulation environments.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Simulation user password: pulled from env if provided, otherwise a strong random
// generated per server boot. Avoids hardcoded credentials in source.
const SIM_PASSWORD =
  process.env.SIM_USER_PASSWORD && process.env.SIM_USER_PASSWORD.length >= 12
    ? process.env.SIM_USER_PASSWORD
    : `sim-${crypto.randomUUID()}-${crypto.randomUUID()}`;
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

// Ensure simulation match has at least MIN_MARGIN house margin.
// Adjusts odds proportionally (preserves probability ratios) so overround = 1.02.
const MIN_OVERROUND = 1.02;
function applyMarginFloor(odds: { home: number; draw: number; away: number }) {
  const h = Number(odds.home), d = Number(odds.draw), a = Number(odds.away);
  const overround = 1 / h + 1 / d + 1 / a;
  const originalMargin = +(((overround - 1) * 100)).toFixed(2);
  if (overround >= MIN_OVERROUND) {
    return {
      home: +h.toFixed(2), draw: +d.toFixed(2), away: +a.toFixed(2),
      original: { home: +h.toFixed(2), draw: +d.toFixed(2), away: +a.toFixed(2) },
      original_margin: originalMargin,
      adjusted_margin: originalMargin,
      margin_adjusted: false,
    };
  }
  // Scale odds: new_odds = old * (overround / MIN_OVERROUND)
  const k = overround / MIN_OVERROUND;
  const nh = +(h * k).toFixed(2);
  const nd = +(d * k).toFixed(2);
  const na = +(a * k).toFixed(2);
  const newOverround = 1 / nh + 1 / nd + 1 / na;
  return {
    home: nh, draw: nd, away: na,
    original: { home: +h.toFixed(2), draw: +d.toFixed(2), away: +a.toFixed(2) },
    original_margin: originalMargin,
    adjusted_margin: +(((newOverround - 1) * 100)).toFixed(2),
    margin_adjusted: true,
  };
}

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
  const delta = startingBalance - bal;
  if (delta > 0) {
    await supabaseAdmin.rpc("wallet_apply_change", {
      p_user_id: uid, p_type: "credit", p_amount: delta,
      p_reference_type: "admin_adjustment", p_reference_id: null,
      p_note: "Simulation starting balance (credit to target)", p_is_simulation: true,
    });
  } else if (delta < 0) {
    await supabaseAdmin.rpc("wallet_apply_change", {
      p_user_id: uid, p_type: "debit", p_amount: -delta,
      p_reference_type: "admin_adjustment", p_reference_id: null,
      p_note: "Simulation starting balance (debit to target)", p_is_simulation: true,
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
  .inputValidator((i: unknown) =>
    z.object({
      matchCount: z.number().int().min(1).max(200).default(SIM_MATCH_COUNT),
      mode: z.enum(["sequential", "batch"]).default("batch"),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count } = await (supabaseAdmin as any).from("matches")
      .select("id", { count: "exact", head: true })
      .eq("is_simulation", true)
      .in("status", ["scheduled", "live"]);
    if ((count ?? 0) >= data.matchCount) {
      return { created: 0, skipped: count, message: "Already seeded" };
    }

    // Pull real World Cup 2026 matchday-1 fixtures + odds; fall back to
    // generic fake teams if the upstream APIs are unavailable.
    const { fetchWorldCupMatchday1Fixtures } = await import("@/lib/sim-worldcup.server");
    let wcWarning: string | undefined;
    let wcFixtures: Awaited<ReturnType<typeof fetchWorldCupMatchday1Fixtures>>["fixtures"] = [];
    try {
      const res = await fetchWorldCupMatchday1Fixtures();
      wcFixtures = res.fixtures;
      wcWarning = res.warning;
    } catch (e) {
      wcWarning = (e as Error).message;
    }

    const now = Date.now();
    const rows: any[] = [];
    const usedTeams = new Set<string>();
    let teamIdx = 0;
    let realOddsCount = 0;
    let wcMatchesUsed = 0;

    for (let i = 0; i < data.matchCount; i++) {
      // Batch: kick off 30 min out so seeding (coverage + fill passes) can
      // never race the kickoff lock — batch settle force-starts matches anyway.
      // Sequential: stagger 1 min apart.
      const offsetMs = data.mode === "batch" ? 30 * 60_000 : i * SIM_INTERVAL_MIN * 60_000;
      const kickoff = new Date(now + offsetMs).toISOString();

      const wc = wcFixtures[i];
      if (wc) {
        wcMatchesUsed++;
        if (wc.odds_source === "the-odds-api") realOddsCount++;
        const adjusted = applyMarginFloor(wc.reference_odds);
        rows.push({
          home_team: wc.home_team,
          away_team: wc.away_team,
          home_crest: wc.home_crest,
          away_crest: wc.away_crest,
          group_name: wc.group_name,
          kickoff_at: kickoff,
          status: "scheduled",
          stage: data.mode === "batch"
            ? `${wc.stage} (Sim Batch)`
            : `${wc.stage} (Sim)`,
          is_simulation: true,
          reference_odds: adjusted,
          odds_source: wc.odds_source === "the-odds-api" ? "the-odds-api" : "simulation",
          odds_updated_at: new Date().toISOString(),
        });
      } else {
        // Fallback: generic placeholder teams + random odds
        let home = SIM_TEAMS[teamIdx++ % SIM_TEAMS.length];
        let away = SIM_TEAMS[teamIdx++ % SIM_TEAMS.length];
        while (usedTeams.has(home + away) || home === away) {
          away = SIM_TEAMS[teamIdx++ % SIM_TEAMS.length];
        }
        usedTeams.add(home + away);
        const adjusted = applyMarginFloor({
          home: +(1.5 + Math.random() * 3).toFixed(2),
          draw: +(2.8 + Math.random() * 2.2).toFixed(2),
          away: +(1.5 + Math.random() * 3).toFixed(2),
        });
        rows.push({
          home_team: home,
          away_team: away,
          kickoff_at: kickoff,
          status: "scheduled",
          stage: data.mode === "batch" ? "Simulation Cup (Batch)" : "Simulation Cup",
          is_simulation: true,
          reference_odds: adjusted,
        });
      }
    }

    const { data: inserted, error } = await (supabaseAdmin as any)
      .from("matches").insert(rows).select("id, reference_odds");
    if (error) throw new Error(error.message);

    const snaps = (inserted ?? []).map((m: any, idx: number) => ({
      match_id: m.id,
      home_odds: m.reference_odds?.home,
      draw_odds: m.reference_odds?.draw,
      away_odds: m.reference_odds?.away,
      source: rows[idx]?.odds_source === "the-odds-api" ? "the-odds-api" : "simulation",
      raw_bookmaker_count: wcFixtures[idx]?.raw_bookmaker_count ?? null,
      sampled_at: new Date().toISOString(),
    }));
    if (snaps.length) {
      await (supabaseAdmin as any).from("match_odds_snapshots").insert(snaps);
    }
    return {
      created: inserted?.length ?? 0,
      mode: data.mode,
      worldCupFixturesUsed: wcMatchesUsed,
      realOddsCount,
      fallbackCount: (inserted?.length ?? 0) - wcMatchesUsed,
      marginAdjustedCount: rows.filter((r: any) => r.reference_odds?.margin_adjusted).length,
      warning: wcWarning,
    };
  });


// =========================================================
//  SEED random predictions for all scheduled sim matches
// =========================================================
export const seedSimulationPredictions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      minUsersPerMatch: z.number().int().min(1).default(5),
      maxUsersPerMatch: z.number().int().min(1).default(15),
      minStake: z.number().int().min(1).default(25),
      maxStake: z.number().int().min(1).default(150),
      exposureTargetPct: z.number().min(0).max(1).default(0.6),
      matchOffset: z.number().int().min(0).default(0),
      matchLimit: z.number().int().min(1).max(50).default(5),
      pass: z.enum(["coverage", "fill"]).default("fill"),
      coverageMinBetsPerMatch: z.number().int().min(1).default(3),
      coverageMinStake: z.number().int().min(1).default(10),
      coverageMaxStake: z.number().int().min(1).default(25),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: users } = await (supabaseAdmin as any)
      .from("profiles").select("id").eq("is_simulation", true);
    const userIds: string[] = (users ?? []).map((u: any) => u.id);
    if (!userIds.length) return { error: "No sim users — seed users first", done: true };

    const { data: rawMatches } = await (supabaseAdmin as any)
      .from("matches")
      .select("id, reference_odds, home_team, away_team")
      .eq("is_simulation", true)
      .eq("status", "scheduled")
      .order("kickoff_at", { ascending: true })
      .order("id", { ascending: true });

    if (!rawMatches?.length) return { error: "No scheduled sim matches", done: true };

    // Deduplicate by primary key match.id. In batch mode every match shares
    // the same kickoff_at, which made `ORDER BY kickoff_at` non-deterministic
    // across paginated calls and produced duplicate rows in slices.
    const rawMatchesCount = rawMatches.length;
    const seenIds = new Set<string>();
    const matches: any[] = [];
    const duplicateMatchIds: string[] = [];
    for (const m of rawMatches) {
      if (seenIds.has(m.id)) { duplicateMatchIds.push(m.id); continue; }
      seenIds.add(m.id);
      matches.push(m);
    }

    const totalMatches = matches.length;
    const slice = matches.slice(data.matchOffset, data.matchOffset + data.matchLimit);
    const nextOffset = data.matchOffset + slice.length;

    const { data: bankrollRow } = await (supabaseAdmin as any)
      .from("platform_bankroll").select("balance").eq("id", 2).maybeSingle();
    const bankroll = Number(bankrollRow?.balance ?? 0);
    const exposureCap = bankroll * data.exposureTargetPct;

    const { data: liveMatches } = await (supabaseAdmin as any)
      .from("matches").select("worst_case_exposure")
      .eq("is_simulation", true).in("status", ["scheduled", "live"]);
    let globalExposure = (liveMatches ?? []).reduce(
      (s: number, x: any) => s + Number(x.worst_case_exposure || 0), 0);

    const minU = Math.min(data.minUsersPerMatch, data.maxUsersPerMatch);
    const maxU = Math.max(data.minUsersPerMatch, data.maxUsersPerMatch);
    const minS = Math.min(data.minStake, data.maxStake);
    const maxS = Math.max(data.minStake, data.maxStake);

    // Pass-specific stake range.
    // Coverage pass ALWAYS uses tiny stakes (default 10–25) and ignores the
    // normal exposure target — only a hard 95%-of-bankroll emergency cap applies.
    const isCoverage = data.pass === "coverage";
    const EMERGENCY_CAP_PCT = 0.95;
    const emergencyCap = bankroll * EMERGENCY_CAP_PCT;
    const stakeMin = isCoverage ? Math.min(data.coverageMinStake, data.coverageMaxStake) : minS;
    const stakeMax = isCoverage ? Math.max(data.coverageMinStake, data.coverageMaxStake) : maxS;

    // For fill pass, look up existing pending bets per match in slice so
    // we add extra users (not duplicates) and respect per-user uniqueness.
    const sliceIds = slice.map((m: any) => m.id);
    const existingByMatch = new Map<string, { count: number; userIds: Set<string> }>();
    if (sliceIds.length) {
      const { data: existingPreds } = await (supabaseAdmin as any)
        .from("predictions")
        .select("match_id, user_id")
        .eq("is_simulation", true)
        .eq("status", "pending")
        .in("match_id", sliceIds);
      for (const id of sliceIds) existingByMatch.set(id, { count: 0, userIds: new Set() });
      for (const p of (existingPreds ?? [])) {
        const e = existingByMatch.get(p.match_id)!;
        e.count++;
        e.userIds.add(p.user_id);
      }
    }

    let predictionsCreated = 0;
    let predictionsFailed = 0;
    let totalStakes = 0;
    let totalExposure = 0;
    const errorSamples: string[] = [];
    let stoppedAtCap = false;
    const brokeUsers = new Set<string>();
    const matchDiagnostics: Array<{
      matchId: string;
      match: string;
      betsCreated: number;
      failedAttempts: number;
      failureReason: string | null;
      poolCreated: boolean;
    }> = [];

    if (isCoverage) {
      // =====================================================
      // COVERAGE PASS — deterministic round-robin allocation.
      // userIndex = (matchIndex * coverageMinBetsPerMatch + betIndex) % users.length
      // Skips unfunded users, never stops the whole pass on a single failure,
      // and records a per-match failure reason.
      // =====================================================
      const { data: walletRows } = await (supabaseAdmin as any)
        .from("wallets").select("user_id, balance").in("user_id", userIds);
      const balances = new Map<string, number>(
        (walletRows ?? []).map((w: any) => [w.user_id, Number(w.balance ?? 0)]),
      );

      for (let si = 0; si < slice.length; si++) {
        const m: any = slice[si];
        const matchIndex = data.matchOffset + si; // GLOBAL index → deterministic across calls
        const ro = m.reference_odds ?? null;
        const existing = existingByMatch.get(m.id) ?? { count: 0, userIds: new Set<string>() };
        const diag = {
          matchId: m.id,
          match: `${m.home_team ?? "?"} vs ${m.away_team ?? "?"}`,
          betsCreated: 0,
          failedAttempts: 0,
          failureReason: null as string | null,
          poolCreated: false,
        };

        const need = Math.max(0, data.coverageMinBetsPerMatch - existing.count);
        if (need <= 0) { matchDiagnostics.push(diag); continue; }

        const oddsOk = ro && Number(ro.home) > 1 && Number(ro.draw) > 1 && Number(ro.away) > 1;
        if (!oddsOk) {
          diag.failureReason = "invalid odds";
          predictionsFailed += need;
          matchDiagnostics.push(diag);
          continue;
        }

        const usedThisMatch = new Set<string>(existing.userIds as Set<string>);
        let matchAborted = false;

        for (let betIndex = 0; betIndex < need && !matchAborted; betIndex++) {
          if (globalExposure >= emergencyCap) {
            stoppedAtCap = true;
            diag.failureReason = diag.failureReason ?? "exposure emergency cap";
            break;
          }

          const baseIdx = (matchIndex * data.coverageMinBetsPerMatch + betIndex) % userIds.length;
          const stake = stakeMin + Math.floor(Math.random() * (stakeMax - stakeMin + 1));
          const r = Math.random();
          const outcome = r < 0.4 ? "HOME" : r < 0.7 ? "AWAY" : "DRAW";
          const odds = outcome === "HOME" ? Number(ro.home) : outcome === "DRAW" ? Number(ro.draw) : Number(ro.away);

          let placedThis = false;
          let lastReason: string | null = null;

          // Walk the user ring from the deterministic start until a funded
          // user successfully places the bet.
          for (let probe = 0; probe < userIds.length; probe++) {
            const uid = userIds[(baseIdx + probe) % userIds.length];
            if (usedThisMatch.has(uid)) continue;
            if ((balances.get(uid) ?? 0) < stake) { lastReason = lastReason ?? "no funded users"; continue; }

            const res: any = await (supabaseAdmin as any).rpc("place_bet_atomic", {
              p_user_id: uid,
              p_match_id: m.id,
              p_market: "result",
              p_outcome: outcome,
              p_odds: odds,
              p_stake: stake,
              p_snapshot_id: null,
              p_cap_pct: EMERGENCY_CAP_PCT,
            });

            if (!res.error) {
              placedThis = true;
              usedThisMatch.add(uid);
              balances.set(uid, (balances.get(uid) ?? 0) - stake);
              predictionsCreated++;
              diag.betsCreated++;
              totalStakes += stake;
              totalExposure += stake * (odds - 1);
              globalExposure += stake * (odds - 1);
              break;
            }

            // Failed attempt — classify, log, and keep going.
            predictionsFailed++;
            diag.failedAttempts++;
            const msg = res.error?.message ?? "";
            if (msg && errorSamples.length < 5) errorSamples.push(msg);

            if (msg.includes("INSUFFICIENT_BALANCE")) {
              balances.set(uid, 0);
              brokeUsers.add(uid);
              lastReason = "no funded users";
              continue; // try next user
            }
            if (msg.includes("MATCH_LOCKED")) {
              lastReason = "match locked";
              matchAborted = true; // locked for everyone — stop this match only
              break;
            }
            if (msg.includes("MAX_EXPOSURE_REACHED")) {
              lastReason = "exposure emergency cap";
              stoppedAtCap = true;
              matchAborted = true;
              break;
            }
            lastReason = "place_bet_atomic rejected";
            continue; // try next user
          }

          if (!placedThis) {
            diag.failureReason = lastReason ?? "unknown error";
          }
        }

        matchDiagnostics.push(diag);
      }

      // Pool created Yes/No for the diagnostic table
      if (sliceIds.length) {
        const { data: pools } = await (supabaseAdmin as any)
          .from("match_stake_pools").select("match_id").in("match_id", sliceIds);
        const poolSet = new Set((pools ?? []).map((p: any) => p.match_id));
        for (const d of matchDiagnostics) d.poolCreated = poolSet.has(d.matchId);
      }
    } else {
      // =====================================================
      // FILL PASS — random extra predictions, respects 60% cap
      // =====================================================
      for (const m of slice as any[]) {
        if (globalExposure >= exposureCap) { stoppedAtCap = true; break; }

        const ro = m.reference_odds ?? { home: 2, draw: 3, away: 2 };
        const existing = existingByMatch.get(m.id) ?? { count: 0, userIds: new Set() };

        const target = Math.floor(Math.random() * (maxU - minU + 1));
        if (target <= 0) continue;

        const eligible = userIds.filter((u) => !brokeUsers.has(u) && !existing.userIds.has(u));
        const pool = [...eligible].sort(() => Math.random() - 0.5);
        const usedThisMatch = new Set<string>();
        let placed = 0;
        let cursor = 0;
        const PARALLEL = 10;

        while (placed < target && cursor < pool.length) {
          if (globalExposure >= exposureCap) { stoppedAtCap = true; break; }

          const need = target - placed;
          const batch = pool.slice(cursor, cursor + Math.min(PARALLEL, need)).filter((u) => !usedThisMatch.has(u));
          cursor += PARALLEL;
          if (!batch.length) continue;
          batch.forEach((u) => usedThisMatch.add(u));

          const results = await Promise.all(batch.map((uid) => {
            const r = Math.random();
            const outcome = r < 0.4 ? "HOME" : r < 0.7 ? "AWAY" : "DRAW";
            const odds = outcome === "HOME" ? ro.home : outcome === "DRAW" ? ro.draw : ro.away;
            const stake = stakeMin + Math.floor(Math.random() * (stakeMax - stakeMin + 1));
            return (supabaseAdmin as any).rpc("place_bet_atomic", {
              p_user_id: uid,
              p_match_id: m.id,
              p_market: "result",
              p_outcome: outcome,
              p_odds: odds,
              p_stake: stake,
              p_snapshot_id: null,
              p_cap_pct: 1.0,
            }).then((res: any) => ({ uid, ok: !res.error, stake, odds, err: res.error?.message }));
          }));

          for (const r of results) {
            if (r.ok) {
              predictionsCreated++;
              placed++;
              totalStakes += r.stake;
              totalExposure += r.stake * (r.odds - 1);
              globalExposure += r.stake * (r.odds - 1);
            } else {
              predictionsFailed++;
              const msg = r.err ?? "";
              if (msg.includes("INSUFFICIENT_BALANCE")) {
                brokeUsers.add(r.uid);
              } else if (msg.includes("MAX_EXPOSURE_REACHED")) {
                stoppedAtCap = true;
                break;
              }
              if (msg && errorSamples.length < 5) errorSamples.push(msg);
            }
          }
        }
      }
    }

    // Coverage pass always advances through every match so the client can
    // keep walking the full list (and retry with fallback stakes if cap hit).
    const done = nextOffset >= totalMatches || (!isCoverage && stoppedAtCap);
    return {
      predictionsCreated, predictionsFailed,
      totalStakes, totalExposure,
      matchesProcessed: slice.length,
      stoppedAtCap, exposureCap,
      nextOffset, totalMatches, done,
      errorSamples,
      brokeUserCount: brokeUsers.size,
      pass: data.pass,
      coverageMinBetsPerMatch: data.coverageMinBetsPerMatch,
      coverageStakeRange: [data.coverageMinStake, data.coverageMaxStake],
      matchDiagnostics,
      rawMatchesCount,
      uniqueMatchesCount: totalMatches,
      duplicateMatchIdsCount: duplicateMatchIds.length,
      duplicateMatchIds,
    };
  });


// =========================================================
//  SEED SUMMARY — counts after seeding for validation
// =========================================================
export const getSimulationSeedSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      { count: users },
      { count: matches },
      { count: predictions },
      { count: walletTxns },
      { count: poolTxns },
      { count: stakeDebits },
      { data: predRows },
      { data: matchRows },
    ] = await Promise.all([
      (supabaseAdmin as any).from("profiles").select("id", { count: "exact", head: true }).eq("is_simulation", true),
      (supabaseAdmin as any).from("matches").select("id", { count: "exact", head: true }).eq("is_simulation", true),
      (supabaseAdmin as any).from("predictions").select("id", { count: "exact", head: true }).eq("is_simulation", true),
      (supabaseAdmin as any).from("wallet_transactions").select("id", { count: "exact", head: true }).eq("is_simulation", true),
      (supabaseAdmin as any).from("match_pool_transactions").select("id", { count: "exact", head: true }).eq("is_simulation", true),
      (supabaseAdmin as any).from("wallet_transactions").select("id", { count: "exact", head: true }).eq("is_simulation", true).eq("reference_type", "bet_placement"),
      (supabaseAdmin as any).from("predictions").select("match_id, virtual_stake, potential_return").eq("is_simulation", true),
      (supabaseAdmin as any).from("matches").select("id").eq("is_simulation", true),
    ]);

    const matchIdsWithBets = new Set((predRows ?? []).map((p: any) => p.match_id));
    const totalStakes = (predRows ?? []).reduce((s: number, p: any) => s + Number(p.virtual_stake || 0), 0);
    const totalExposure = (predRows ?? []).reduce((s: number, p: any) => s + (Number(p.potential_return || 0) - Number(p.virtual_stake || 0)), 0);

    // per-match bet distribution
    const perMatch = new Map<string, number>();
    for (const m of (matchRows ?? [])) perMatch.set(m.id, 0);
    for (const p of (predRows ?? [])) perMatch.set(p.match_id, (perMatch.get(p.match_id) ?? 0) + 1);
    const counts = Array.from(perMatch.values());
    const withBets = counts.filter((c) => c > 0);
    const minBetsPerMatch = withBets.length ? Math.min(...withBets) : 0;
    const maxBetsPerMatch = counts.length ? Math.max(...counts) : 0;
    const avgBetsPerMatch = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;

    return {
      users: users ?? 0,
      matches: matches ?? 0,
      predictions: predictions ?? 0,
      walletTxns: walletTxns ?? 0,
      poolTxns: poolTxns ?? 0,
      stakeDebits: stakeDebits ?? 0,
      totalStakes,
      totalExposure,
      matchesWithBets: matchIdsWithBets.size,
      matchesWithoutBets: (matchRows ?? []).filter((m: any) => !matchIdsWithBets.has(m.id)).length,
      minBetsPerMatch,
      maxBetsPerMatch,
      avgBetsPerMatch: +avgBetsPerMatch.toFixed(2),
      status: (predictions ?? 0) > 0 && (poolTxns ?? 0) > 0 && (stakeDebits ?? 0) > 0 ? "success" : "failed",
    };
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

    // re-top-up sim user wallets back to starting balance (parallel chunks)
    const { data: users } = await (supabaseAdmin as any)
      .from("profiles").select("id").eq("is_simulation", true);
    const ids = (users ?? []).map((u: any) => u.id);
    const chunkSize = 20;
    for (let i = 0; i < ids.length; i += chunkSize) {
      await Promise.all(ids.slice(i, i + chunkSize).map((id: string) => ensureSimWallet(supabaseAdmin, id)));
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
      { data: allPreds },
    ] = await Promise.all([
      (supabaseAdmin as any).from("platform_bankroll").select("*").eq("id", 2).maybeSingle(),
      (supabaseAdmin as any).from("profiles").select("id", { count: "exact", head: true }).eq("is_simulation", true),
      (supabaseAdmin as any).from("matches").select("id, status, worst_case_exposure").eq("is_simulation", true),
      (supabaseAdmin as any).from("predictions").select("id", { count: "exact", head: true }).eq("is_simulation", true),
      (supabaseAdmin as any).from("match_stake_pools").select("total_pool, settled").eq("is_simulation", true),
      (supabaseAdmin as any).from("predictions").select("user_id, status, virtual_stake, potential_return").eq("is_simulation", true),
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

    // Per-user settled P/L and pending stakes — derived from predictions, independent of starting balance
    const settledPLMap = new Map<string, number>();
    const pendingStakesMap = new Map<string, number>();
    for (const p of allPreds ?? []) {
      const stake = Number(p.virtual_stake || 0);
      if (p.status === "pending") {
        pendingStakesMap.set(p.user_id, (pendingStakesMap.get(p.user_id) ?? 0) + stake);
      } else if (p.status === "won") {
        const payout = Number(p.potential_return || 0);
        settledPLMap.set(p.user_id, (settledPLMap.get(p.user_id) ?? 0) + (payout - stake));
      } else if (p.status === "lost") {
        settledPLMap.set(p.user_id, (settledPLMap.get(p.user_id) ?? 0) - stake);
      }
      // 'void' is neutral
    }

    const anySettled = (byStatus.finished + byStatus.cancelled) > 0
      && Array.from(settledPLMap.values()).some((v) => v !== 0);

    // Rank: by settled P/L if anything settled, otherwise by total P/L (settled - pending)
    const allUserIds = new Set<string>([...settledPLMap.keys(), ...pendingStakesMap.keys()]);
    let topWin: { user_id: string; pl: number } | null = null;
    let topLoss: { user_id: string; pl: number } | null = null;
    for (const uid of allUserIds) {
      const pl = anySettled
        ? (settledPLMap.get(uid) ?? 0)
        : (settledPLMap.get(uid) ?? 0) - (pendingStakesMap.get(uid) ?? 0);
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
      anySettled,
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

    const [{ data: wallets }, { data: preds }] = await Promise.all([
      (supabaseAdmin as any).from("wallets").select("user_id, balance, updated_at").in("user_id", ids),
      (supabaseAdmin as any).from("predictions")
        .select("user_id, status, virtual_stake, potential_return")
        .in("user_id", ids).eq("is_simulation", true),
    ]);
    const wMap = new Map((wallets ?? []).map((w: any) => [w.user_id, w]));
    const predCount = new Map<string, number>();
    const pendingStakes = new Map<string, number>();
    const settledPL = new Map<string, number>();
    for (const p of preds ?? []) {
      predCount.set(p.user_id, (predCount.get(p.user_id) ?? 0) + 1);
      const stake = Number(p.virtual_stake || 0);
      if (p.status === "pending") {
        pendingStakes.set(p.user_id, (pendingStakes.get(p.user_id) ?? 0) + stake);
      } else if (p.status === "won") {
        settledPL.set(p.user_id, (settledPL.get(p.user_id) ?? 0) + (Number(p.potential_return || 0) - stake));
      } else if (p.status === "lost") {
        settledPL.set(p.user_id, (settledPL.get(p.user_id) ?? 0) - stake);
      }
    }
    return {
      users: (profs ?? []).map((p: any, idx: number) => {
        const pStakes = pendingStakes.get(p.id) ?? 0;
        const sPL = settledPL.get(p.id) ?? 0;
        return {
          id: p.id,
          displayName: p.display_name,
          email: simEmail(idx + 1),
          password: SIM_PASSWORD,
          balance: Number((wMap.get(p.id) as any)?.balance ?? 0),
          predictionCount: predCount.get(p.id) ?? 0,
          pendingStakes: pStakes,
          settledPL: sPL,
          totalPL: sPL - pStakes,
          profitLoss: sPL - pStakes, // back-compat for any existing UI
          lastActivity: (wMap.get(p.id) as any)?.updated_at ?? null,
        };
      }),
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
        const homePool = Number(pool?.home_pool ?? 0);
        const drawPool = Number(pool?.draw_pool ?? 0);
        const awayPool = Number(pool?.away_pool ?? 0);
        const remainingPool = Number(pool?.total_pool ?? 0);
        // Original pool survives settlement because pool_apply_change only mutates
        // home/draw/away_pool when outcome matches; settlement uses outcome=NULL.
        const originalPool = homePool + drawPool + awayPool;
        const payouts = payoutsByMatch.get(m.id) ?? 0;
        const isSettled = !!pool?.settled;
        const ro = m.reference_odds ?? {};
        return {
          id: m.id,
          label: `${m.home_team} vs ${m.away_team}`,
          kickoff: m.kickoff_at,
          status: m.status,
          odds: { home: ro.home, draw: ro.draw, away: ro.away },
          originalOdds: ro.original ?? null,
          originalMargin: ro.original_margin ?? null,
          adjustedMargin: ro.adjusted_margin ?? null,
          marginAdjusted: !!ro.margin_adjusted,
          originalPool,
          remainingPool,
          totalPool: originalPool, // back-compat
          homePool, drawPool, awayPool,
          worst: Number(m.worst_case_exposure ?? 0),
          finalScore: m.status === "finished" ? `${m.home_score}-${m.away_score}` : null,
          payouts,
          settled: isSettled,
          profitLoss: isSettled ? originalPool - payouts : 0,
        };
      }),
    };
  });

// =========================================================
//  Validate seed — actual vs configured starting balance
// =========================================================
export const validateSimulationSeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profs } = await (supabaseAdmin as any)
      .from("profiles").select("id").eq("is_simulation", true);
    const ids: string[] = (profs ?? []).map((p: any) => p.id);
    if (!ids.length) return { userCount: 0, averageBalance: 0, totalIssued: 0 };
    const { data: wallets } = await (supabaseAdmin as any)
      .from("wallets").select("user_id, balance").in("user_id", ids);
    const balances = (wallets ?? []).map((w: any) => Number(w.balance || 0));
    const total = balances.reduce((s: number, b: number) => s + b, 0);
    return {
      userCount: ids.length,
      averageBalance: balances.length ? total / balances.length : 0,
      totalIssued: total,
    };
  });

// =========================================================
//  BATCH SETTLE — settles every live sim match together
// =========================================================
export const runSimulationBatchSettle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const clientT0 = Date.now();
    const { data, error } = await (supabaseAdmin as any).rpc("run_simulation_batch_settle");
    if (error) throw new Error(error.message);
    const clientMs = Date.now() - clientT0;
    return { ...(data as any), client_round_trip_ms: clientMs };
  });

// =========================================================
//  Stress test metrics
// =========================================================
export const getSimulationStressMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc("get_simulation_stress_metrics");
    if (error) throw new Error(error.message);
    return data as Record<string, number>;
  });

// =========================================================
//  Outcome analytics (odds-vs-actual)
// =========================================================
export const getSimulationOutcomeAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc("get_simulation_outcome_analytics");
    if (error) throw new Error(error.message);
    return data as Record<string, number>;
  });


// =========================================================
//  Settlement summary (post-batch)
// =========================================================
export const getSimulationSettlementSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: matches }, { data: pools }, { data: payouts }, { data: preds }, { data: bankroll }] =
      await Promise.all([
        (supabaseAdmin as any).from("matches")
          .select("id, home_team, away_team, status, home_score, away_score")
          .eq("is_simulation", true),
        (supabaseAdmin as any).from("match_stake_pools")
          .select("match_id, home_pool, draw_pool, away_pool, settled")
          .eq("is_simulation", true),
        (supabaseAdmin as any).from("platform_transactions")
          .select("match_id, amount, transaction_type").eq("is_simulation", true)
          .eq("transaction_type", "payout_paid"),
        (supabaseAdmin as any).from("predictions")
          .select("user_id, status, virtual_stake, potential_return").eq("is_simulation", true),
        (supabaseAdmin as any).from("platform_bankroll").select("*").eq("id", 2).maybeSingle(),
      ]);

    const poolByMatch = new Map((pools ?? []).map((p: any) => [p.match_id, p]));
    const payoutByMatch = new Map<string, number>();
    for (const t of payouts ?? []) {
      payoutByMatch.set(t.match_id, (payoutByMatch.get(t.match_id) ?? 0) + Number(t.amount));
    }

    // Per-match P/L (settled only)
    let highestPayoutMatch: any = null;
    let highestProfitMatch: any = null;
    let highestLossMatch: any = null;
    let matchesSettled = 0;
    let totalStakes = 0;
    let totalPayouts = 0;

    for (const m of matches ?? []) {
      const pool: any = poolByMatch.get(m.id);
      if (!pool?.settled) continue;
      matchesSettled++;
      const original = Number(pool.home_pool || 0) + Number(pool.draw_pool || 0) + Number(pool.away_pool || 0);
      const payout = payoutByMatch.get(m.id) ?? 0;
      const pl = original - payout;
      totalStakes += original;
      totalPayouts += payout;
      const row = { id: m.id, label: `${m.home_team} vs ${m.away_team}`, score: `${m.home_score}-${m.away_score}`, original, payout, pl };
      if (!highestPayoutMatch || payout > highestPayoutMatch.payout) highestPayoutMatch = row;
      if (!highestProfitMatch || pl > highestProfitMatch.pl) highestProfitMatch = row;
      if (!highestLossMatch || pl < highestLossMatch.pl) highestLossMatch = row;
    }

    // Biggest winning / losing user
    const userPL = new Map<string, number>();
    let predsSettled = 0;
    for (const p of preds ?? []) {
      const stake = Number(p.virtual_stake || 0);
      if (p.status === "won") {
        const payout = Number(p.potential_return || 0);
        userPL.set(p.user_id, (userPL.get(p.user_id) ?? 0) + (payout - stake));
        predsSettled++;
      } else if (p.status === "lost") {
        userPL.set(p.user_id, (userPL.get(p.user_id) ?? 0) - stake);
        predsSettled++;
      } else if (p.status === "void") {
        predsSettled++;
      }
    }
    let topUser: { user_id: string; pl: number } | null = null;
    let botUser: { user_id: string; pl: number } | null = null;
    for (const [uid, pl] of userPL) {
      if (!topUser || pl > topUser.pl) topUser = { user_id: uid, pl };
      if (!botUser || pl < botUser.pl) botUser = { user_id: uid, pl };
    }
    const ids: string[] = [];
    if (topUser) ids.push(topUser.user_id);
    if (botUser) ids.push(botUser.user_id);
    const nameMap: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await (supabaseAdmin as any).from("profiles").select("id, display_name").in("id", ids);
      for (const p of profs ?? []) nameMap[p.id] = p.display_name;
    }

    return {
      matchesSettled,
      predictionsSettled: predsSettled,
      totalStakes,
      totalPayouts,
      netPlatformPL: totalStakes - totalPayouts,
      bankrollBalance: Number((bankroll as any)?.balance ?? 0),
      biggestWinner: topUser ? { name: nameMap[topUser.user_id] ?? topUser.user_id.slice(0, 8), pl: topUser.pl } : null,
      biggestLoser: botUser ? { name: nameMap[botUser.user_id] ?? botUser.user_id.slice(0, 8), pl: botUser.pl } : null,
      highestPayoutMatch,
      highestProfitMatch,
      highestLossMatch,
    };
  });


