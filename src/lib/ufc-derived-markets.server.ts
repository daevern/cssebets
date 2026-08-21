// Server-only: derive Method / Round / Total Rounds markets for UFC fights
// that only have a moneyline price.
//
// Why: upcoming cards are discovered through The Odds API, which we poll for
// the h2h (moneyline) market only. Fights sourced that way therefore showed a
// single tab on the fight page. This module synthesises the secondary markets
// from the moneyline plus each fighter's career finish mix, using the same
// modelling the API-Sports MMA builder uses when a book is silent.
//
// Selection keys match the richer builder exactly, so if the API-Sports feed
// later prices the same fight the real numbers simply overwrite these rows:
//   method       : '{a|b}_{ko_tko|submission|decision}'
//   round        : 'r1'..'r5' | 'distance'
//   total_rounds : 'over_2_5' | 'under_2_5' | 'over_4_5' | 'under_4_5'
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { applyOutrightMargin, getRealOddsMarginSettings } from "@/lib/odds-margin.server";

// Freeze secondary markets 30 minutes before the walk-outs, same as the
// API-Sports builder, so we never quote a stale synthetic price at the bell.
const LOCK_MS = 30 * 60 * 1000;

// Baseline share of fights that end inside the distance (UFC-wide).
const BASE_FINISH_3 = 0.45;
const BASE_FINISH_5 = 0.55;

// Bayesian prior over the KO/Sub split among finishes (~65/35).
const PRIOR_KO = 6.5;
const PRIOR_SUB = 3.5;

const ROUND_WEIGHTS_3 = [0.4, 0.32, 0.28];
const ROUND_WEIGHTS_5 = [0.3, 0.24, 0.19, 0.15, 0.12];

const METHOD_MAX_ODDS = 40;

type FighterRec = { ko_w: number | null; sub_w: number | null; record_w: number | null } | null;

function finishMix(rec: FighterRec): { ko: number; sub: number } {
  const ko = Number(rec?.ko_w ?? 0);
  const sub = Number(rec?.sub_w ?? 0);
  const t = ko + sub + PRIOR_KO + PRIOR_SUB;
  return { ko: (ko + PRIOR_KO) / t, sub: (sub + PRIOR_SUB) / t };
}

// Career finish rate blended toward the UFC-wide base rate so fighters with
// thin records don't skew the model.
function finishRate(rec: FighterRec, base: number): number {
  const wins = Number(rec?.record_w ?? 0);
  const finishes = Number(rec?.ko_w ?? 0) + Number(rec?.sub_w ?? 0);
  if (wins <= 0) return base;
  const PSEUDO = 8;
  return (finishes + base * PSEUDO) / (wins + PSEUDO);
}

async function apply2Way(a: number, b: number): Promise<{ a: number; b: number }> {
  const { marginPct, apply } = await getRealOddsMarginSettings();
  if (!apply || marginPct <= 0) {
    return { a: +a.toFixed(2), b: +b.toFixed(2) };
  }
  const priced = await applyOutrightMargin([
    { team: "a", odds: a },
    { team: "b", odds: b },
  ]);
  return {
    a: priced.find((p) => p.team === "a")!.odds,
    b: priced.find((p) => p.team === "b")!.odds,
  };
}

export type DerivedMarketsResult = {
  ok: boolean;
  reason?: string;
  rows: number;
};

/**
 * Derive and persist Method / Round / Total Rounds for a single fight from its
 * active moneyline prices. No-ops when the fight already has feed-sourced
 * secondary markets, when there is no moneyline, or when the market is locked.
 */
export async function deriveUfcSecondaryMarkets(
  fightId: string,
  opts: { force?: boolean } = {},
): Promise<DerivedMarketsResult> {
  const { data: fight } = await (supabaseAdmin as any)
    .from("ufc_fights")
    .select(
      "id, fighter_a, fighter_b, scheduled_rounds, commence_time, apimma_fight_id, apimma_fighter_a_id, apimma_fighter_b_id, status",
    )
    .eq("id", fightId)
    .maybeSingle();
  if (!fight) return { ok: false, reason: "fight not found", rows: 0 };

  // The API-Sports builder owns fights it can see — don't fight it for control.
  if (fight.apimma_fight_id && !opts.force) {
    return { ok: false, reason: "apimma feed owns this fight", rows: 0 };
  }

  const commenceMs = fight.commence_time ? new Date(fight.commence_time).getTime() : 0;
  if (commenceMs > 0 && commenceMs - Date.now() <= LOCK_MS) {
    await (supabaseAdmin as any)
      .from("ufc_fight_markets")
      .update({ is_active: false })
      .eq("fight_id", fight.id)
      .in("market_type", ["method", "round", "total_rounds"]);
    return { ok: false, reason: "locked (T-30m)", rows: 0 };
  }

  const { data: ml } = await (supabaseAdmin as any)
    .from("ufc_fight_markets")
    .select("selection_key, odds")
    .eq("fight_id", fight.id)
    .eq("market_type", "moneyline")
    .eq("is_active", true);
  const oddsA = Number((ml ?? []).find((m: any) => m.selection_key === "a")?.odds ?? 0);
  const oddsB = Number((ml ?? []).find((m: any) => m.selection_key === "b")?.odds ?? 0);
  if (!(oddsA > 1) || !(oddsB > 1)) return { ok: false, reason: "no moneyline", rows: 0 };

  // De-margin the moneyline into fair win probabilities.
  const invA = 1 / oddsA;
  const invB = 1 / oddsB;
  const sum = invA + invB;
  const pA = invA / sum;
  const pB = invB / sum;

  const scheduled: 3 | 5 = fight.scheduled_rounds === 5 ? 5 : 3;
  const base = scheduled === 5 ? BASE_FINISH_5 : BASE_FINISH_3;
  const weights = scheduled === 5 ? ROUND_WEIGHTS_5 : ROUND_WEIGHTS_3;

  const [{ data: recA }, { data: recB }] = await Promise.all([
    (supabaseAdmin as any)
      .from("ufc_fighters")
      .select("ko_w, sub_w, record_w")
      .eq("name", fight.fighter_a)
      .maybeSingle(),
    (supabaseAdmin as any)
      .from("ufc_fighters")
      .select("ko_w, sub_w, record_w")
      .eq("name", fight.fighter_b)
      .maybeSingle(),
  ]);

  // Overall finish probability — each fighter's finish rate weighted by how
  // likely they are to win.
  const pFinish = Math.min(
    0.9,
    Math.max(0.1, pA * finishRate(recA, base) + pB * finishRate(recB, base)),
  );
  const pDistance = 1 - pFinish;

  const nowIso = new Date().toISOString();
  const upserts: any[] = [];
  const snapshots: any[] = [];

  // ---- Method of victory ----
  const mixA = finishMix(recA);
  const mixB = finishMix(recB);
  const methodProbs: Record<string, number> = {
    a_ko_tko: Math.max(0.005, pFinish * pA * mixA.ko),
    a_submission: Math.max(0.005, pFinish * pA * mixA.sub),
    a_decision: Math.max(0.005, pDistance * pA),
    b_ko_tko: Math.max(0.005, pFinish * pB * mixB.ko),
    b_submission: Math.max(0.005, pFinish * pB * mixB.sub),
    b_decision: Math.max(0.005, pDistance * pB),
  };
  const methodPriced = await applyOutrightMargin(
    Object.entries(methodProbs).map(([team, p]) => ({ team, odds: 1 / p })),
  );
  for (const p of methodPriced) {
    const [slot, ...rest] = p.team.split("_");
    const m = rest.join("_");
    const fighter = slot === "a" ? fight.fighter_a : fight.fighter_b;
    const label = `${fighter} by ${m === "ko_tko" ? "KO/TKO" : m === "submission" ? "Submission" : "Decision"}`;
    const odds = Math.min(METHOD_MAX_ODDS, Number(p.odds));
    upserts.push({
      fight_id: fight.id,
      market_type: "method",
      selection_key: p.team,
      label,
      odds,
      is_active: true,
      updated_at: nowIso,
    });
    snapshots.push({ fight_id: fight.id, market_type: "method", selection_key: p.team, odds });
  }

  // ---- Finishing round (+ goes the distance) ----
  const roundProbs: Record<string, number> = { distance: pDistance };
  weights.forEach((w, i) => {
    roundProbs[`r${i + 1}`] = Math.max(0.005, pFinish * w);
  });
  const roundPriced = await applyOutrightMargin(
    Object.entries(roundProbs).map(([team, p]) => ({ team, odds: 1 / p })),
  );
  for (const p of roundPriced) {
    const label = p.team === "distance" ? "Goes the distance" : `Round ${p.team.slice(1)}`;
    const odds = Math.min(METHOD_MAX_ODDS, Number(p.odds));
    upserts.push({
      fight_id: fight.id,
      market_type: "round",
      selection_key: p.team,
      label,
      odds,
      is_active: true,
      updated_at: nowIso,
    });
    snapshots.push({ fight_id: fight.id, market_type: "round", selection_key: p.team, odds });
  }

  // ---- Total rounds (2.5 always; 4.5 on championship/main-event distance) ----
  const lines = scheduled === 5 ? [2, 4] : [2];
  for (const k of lines) {
    // Under X.5 = the fight ends before the mid-point of round k+1.
    let pUnder = 0;
    for (let i = 0; i < k; i++) pUnder += pFinish * (weights[i] ?? 0);
    pUnder += 0.5 * pFinish * (weights[k] ?? 0);
    pUnder = Math.min(0.95, Math.max(0.05, pUnder));
    const priced = await apply2Way(1 / (1 - pUnder), 1 / pUnder);
    const line = `${k}_5`;
    const lineLabel = `${k}.5`;
    upserts.push(
      {
        fight_id: fight.id,
        market_type: "total_rounds",
        selection_key: `over_${line}`,
        label: `Over ${lineLabel} rounds`,
        odds: priced.a,
        is_active: true,
        updated_at: nowIso,
      },
      {
        fight_id: fight.id,
        market_type: "total_rounds",
        selection_key: `under_${line}`,
        label: `Under ${lineLabel} rounds`,
        odds: priced.b,
        is_active: true,
        updated_at: nowIso,
      },
    );
    snapshots.push(
      { fight_id: fight.id, market_type: "total_rounds", selection_key: `over_${line}`, odds: priced.a },
      { fight_id: fight.id, market_type: "total_rounds", selection_key: `under_${line}`, odds: priced.b },
    );
  }

  const { error } = await (supabaseAdmin as any)
    .from("ufc_fight_markets")
    .upsert(upserts, { onConflict: "fight_id,market_type,selection_key" });
  if (error) return { ok: false, reason: error.message, rows: 0 };

  // Retire total-rounds lines we no longer surface for this fight.
  const keep = lines.flatMap((k) => [`over_${k}_5`, `under_${k}_5`]);
  await (supabaseAdmin as any)
    .from("ufc_fight_markets")
    .update({ is_active: false })
    .eq("fight_id", fight.id)
    .eq("market_type", "total_rounds")
    .not("selection_key", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);

  if (snapshots.length) {
    await (supabaseAdmin as any).from("ufc_market_snapshots").insert(snapshots);
  }

  return { ok: true, rows: upserts.length };
}

/**
 * Derive secondary markets for every upcoming fight that currently only has a
 * moneyline. Safe to call after each Odds API sync.
 */
export async function deriveUfcSecondaryMarketsForUpcoming(
  opts: { maxFights?: number } = {},
): Promise<{ processed: number; rows: number; skipped: number }> {
  const max = opts.maxFights ?? 80;
  const { data: fights } = await (supabaseAdmin as any)
    .from("ufc_fights")
    .select("id, commence_time")
    .gt("commence_time", new Date(Date.now() + LOCK_MS).toISOString())
    .order("commence_time")
    .limit(max);

  let processed = 0;
  let rows = 0;
  let skipped = 0;
  for (const f of fights ?? []) {
    try {
      const r = await deriveUfcSecondaryMarkets(f.id);
      if (r.ok) {
        processed++;
        rows += r.rows;
      } else {
        skipped++;
      }
    } catch {
      skipped++;
    }
  }
  return { processed, rows, skipped };
}
