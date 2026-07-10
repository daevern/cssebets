// Server-only: pull UFC odds from The Odds API and persist as
// ufc_fight_markets + ufc_market_snapshots. Only main + co-main are kept
// (last two fights on the card by commence_time).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { applyOutrightMargin, getRealOddsMarginSettings } from "@/lib/odds-margin.server";

const SPORT = "mma_mixed_martial_arts";
const BASE = "https://api.the-odds-api.com/v4/sports";

type OddsEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  sport_title?: string;
};

type EventOdds = OddsEvent & {
  bookmakers: Array<{
    key: string;
    markets: Array<{
      key: string;
      outcomes: Array<{ name: string; price: number; description?: string }>;
    }>;
  }>;
};

type SavedFight = {
  id: string;
  fighter_a: string;
  fighter_b: string;
  scheduled_rounds: 3 | 5;
};

const median = (nums: number[]) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

async function apply2WayMargin(a: number, b: number): Promise<{ a: number; b: number }> {
  const priced = await applyOutrightMargin([
    { team: "a", odds: a },
    { team: "b", odds: b },
  ]);
  return {
    a: priced.find((p) => p.team === "a")!.odds,
    b: priced.find((p) => p.team === "b")!.odds,
  };
}

function normalizeFighterName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

async function saveFight(input: {
  eventId: string;
  oddsApiEventId: string;
  fighterA: string;
  fighterB: string;
  commenceTime: string;
  cardPosition: "main" | "co_main" | "other";
  scheduledRounds: 3 | 5;
}): Promise<SavedFight> {
  const selection = "id, fighter_a, fighter_b, scheduled_rounds";
  const payload = {
    event_id: input.eventId,
    odds_api_event_id: input.oddsApiEventId,
    fighter_a: input.fighterA,
    fighter_b: input.fighterB,
    commence_time: input.commenceTime,
    card_position: input.cardPosition,
    scheduled_rounds: input.scheduledRounds,
  };

  const { data: existing, error: lookupError } = await (supabaseAdmin as any)
    .from("ufc_fights")
    .select("id")
    .eq("odds_api_event_id", input.oddsApiEventId)
    .maybeSingle();
  if (lookupError) throw new Error(`fight lookup failed: ${lookupError.message}`);

  const query = existing?.id
    ? (supabaseAdmin as any).from("ufc_fights").update(payload).eq("id", existing.id)
    : (supabaseAdmin as any).from("ufc_fights").insert(payload);

  const { data, error } = await query.select(selection).maybeSingle();
  if (error) throw new Error(`fight save failed: ${error.message}`);
  if (!data) throw new Error("fight save failed: no row returned");
  return data as SavedFight;
}

export type UfcSyncResult = {
  ok: boolean;
  skipped?: string;
  fights?: number;
  markets?: number;
  error?: string;
};

export async function runUfcOddsSync(opts: { force?: boolean } = {}): Promise<UfcSyncResult> {
  const apiKey = process.env.ODDS_API_KEY?.trim();
  if (!apiKey) return { ok: false, skipped: "ODDS_API_KEY not set" };

  const { data: event } = await (supabaseAdmin as any)
    .from("ufc_events")
    .select("id, event_key, name, starts_at")
    .eq("event_key", "ufc_329")
    .eq("is_active", true)
    .maybeSingle();
  if (!event) return { ok: true, skipped: "no active event" };

  // Cost guard: only hit API when we're within 12h of event start (or force).
  const startsAt = new Date(event.starts_at).getTime();
  const now = Date.now();
  const withinWindow = Math.abs(startsAt - now) < 12 * 60 * 60 * 1000;
  if (!opts.force && !withinWindow) {
    return { ok: true, skipped: "outside event window" };
  }

  // 1. List UFC events on the sport
  const evRes = await fetch(`${BASE}/${SPORT}/events?apiKey=${apiKey}`);
  if (!evRes.ok) return { ok: false, error: `events ${evRes.status}` };
  const allEvents = (await evRes.json()) as OddsEvent[];

  // The Odds API tags every MMA fight as sport_title "MMA" — no UFC event name.
  // Strategy: cluster all upcoming fights by their commence date (in UTC), pick
  // the cluster nearest to event.starts_at (or the next upcoming one if that's
  // too far off), then take the last 2 fights of that cluster = co-main + main.
  const sorted = [...allEvents]
    .filter((e) => !Number.isNaN(new Date(e.commence_time).getTime()))
    .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());

  if (!sorted.length) return { ok: true, skipped: "no upcoming MMA events on odds board" };

  // Group by UTC date (YYYY-MM-DD) — a UFC card runs across a single evening/night.
  const clusters = new Map<string, OddsEvent[]>();
  for (const e of sorted) {
    const key = e.commence_time.slice(0, 10);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(e);
  }

  // Pick the cluster closest to our configured starts_at; if none within 30 days,
  // fall back to the next upcoming cluster (>= now).
  const clusterEntries = Array.from(clusters.entries()).map(([date, fights]) => {
    const clusterTs = new Date(fights[0].commence_time).getTime();
    return { date, fights, ts: clusterTs, delta: Math.abs(clusterTs - startsAt) };
  });

  let chosen = clusterEntries.reduce((best, c) => (c.delta < best.delta ? c : best));
  if (chosen.delta > 30 * 24 * 60 * 60 * 1000) {
    const upcoming = clusterEntries.filter((c) => c.ts >= now).sort((a, b) => a.ts - b.ts);
    if (upcoming.length) chosen = upcoming[0];
  }

  const target = chosen.fights;
  if (!target.length) return { ok: true, skipped: "no fights found for event" };

  // Last two by commence_time = co-main + main (main is last).
  const lastTwo = target.slice(-2);
  const [coMain, main] = lastTwo.length === 2 ? lastTwo : [null, lastTwo[0]];

  let totalMarkets = 0;
  const nowIso = new Date().toISOString();

  for (const ev of lastTwo) {
    const isMain = ev === main;
    const isCoMain = ev === coMain;
    const position = isMain ? "main" : isCoMain ? "co_main" : "other";
    const scheduledRounds = isMain ? 5 : 3;

    const fightRow = await saveFight({
      eventId: event.id,
      oddsApiEventId: ev.id,
      fighterA: ev.home_team,
      fighterB: ev.away_team,
      commenceTime: ev.commence_time,
      cardPosition: position,
      scheduledRounds,
    });

    // Fetch odds. The Odds API for MMA only supports h2h (moneyline);
    // method-of-victory and round-betting are NOT offered by this feed. We
    // pull h2h and derive method/round prices from the moneyline using
    // standard MMA priors (see below).
    const oddsUrl =
      `${BASE}/${SPORT}/events/${ev.id}/odds` +
      `?apiKey=${apiKey}&regions=us,eu&markets=h2h&oddsFormat=decimal`;
    const oddsRes = await fetch(oddsUrl);
    if (!oddsRes.ok) continue;
    const eventOdds = (await oddsRes.json()) as EventOdds;

    const h2hA: number[] = [];
    const h2hB: number[] = [];

    const fA = normalizeFighterName(fightRow.fighter_a);
    const fB = normalizeFighterName(fightRow.fighter_b);
    const side = (n: string) => (normalizeFighterName(n) === fA ? "a" : normalizeFighterName(n) === fB ? "b" : null);

    for (const bm of eventOdds.bookmakers ?? []) {
      for (const mkt of bm.markets ?? []) {
        if (mkt.key !== "h2h") continue;
        for (const o of mkt.outcomes) {
          const s = side(o.name);
          if (s === "a" && Number.isFinite(o.price)) h2hA.push(o.price);
          else if (s === "b" && Number.isFinite(o.price)) h2hB.push(o.price);
        }
      }
    }

    if (!h2hA.length || !h2hB.length) continue;

    const upserts: Array<{
      fight_id: string;
      market_type: string;
      selection_key: string;
      label: string;
      odds: number;
      is_active: boolean;
      updated_at: string;
    }> = [];
    const snapshots: Array<{
      fight_id: string;
      market_type: string;
      selection_key: string;
      odds: number;
    }> = [];

    const priced = await apply2WayMargin(median(h2hA), median(h2hB));
    upserts.push(
      { fight_id: fightRow.id, market_type: "moneyline", selection_key: "a", label: fightRow.fighter_a, odds: priced.a, is_active: true, updated_at: nowIso },
      { fight_id: fightRow.id, market_type: "moneyline", selection_key: "b", label: fightRow.fighter_b, odds: priced.b, is_active: true, updated_at: nowIso },
    );
    snapshots.push(
      { fight_id: fightRow.id, market_type: "moneyline", selection_key: "a", odds: priced.a },
      { fight_id: fightRow.id, market_type: "moneyline", selection_key: "b", odds: priced.b },
    );

    // ---------- Derived Method-of-Victory ----------
    // Implied win probabilities from moneyline (fair, post-margin removal
    // done inside apply2WayMargin — we re-derive from the priced numbers).
    const invA = 1 / priced.a;
    const invB = 1 / priced.b;
    const norm = invA + invB;
    const pA = invA / norm;
    const pB = invB / norm;

    // Priors per fighter: split win prob across KO/TKO, Submission, Decision.
    // 5-round main events go the distance more often; 3-rounders less so.
    const methodPriors = scheduledRounds === 5
      ? { ko_tko: 0.42, submission: 0.16, decision: 0.42 }
      : { ko_tko: 0.38, submission: 0.15, decision: 0.47 };

    const methodEntries: Array<{ team: string; odds: number }> = [];
    for (const s of ["a", "b"] as const) {
      const pWin = s === "a" ? pA : pB;
      for (const [m, prior] of Object.entries(methodPriors)) {
        const p = Math.max(pWin * prior, 0.005);
        methodEntries.push({ team: `${s}_${m}`, odds: 1 / p });
      }
    }
    const methodPriced = await applyOutrightMargin(methodEntries);
    for (const p of methodPriced) {
      const [s, ...rest] = p.team.split("_");
      const m = rest.join("_");
      const fighter = s === "a" ? fightRow.fighter_a : fightRow.fighter_b;
      const methodLabel = m === "ko_tko" ? "KO/TKO" : m === "submission" ? "Submission" : "Decision";
      const label = `${fighter} by ${methodLabel}`;
      upserts.push({ fight_id: fightRow.id, market_type: "method", selection_key: p.team, label, odds: p.odds, is_active: true, updated_at: nowIso });
      snapshots.push({ fight_id: fightRow.id, market_type: "method", selection_key: p.team, odds: p.odds });
    }

    // ---------- Derived Round Betting ----------
    // Non-decision probability = 1 - decisionProb (both fighters combined).
    // Distribute finishes across rounds with decreasing weight; "distance"
    // captures decisions.
    const decisionProb = (pA + pB) * methodPriors.decision;
    const finishProb = Math.max(1 - decisionProb, 0.05);
    const roundWeights = scheduledRounds === 5
      ? [0.34, 0.24, 0.18, 0.14, 0.10]
      : [0.45, 0.32, 0.23];
    const roundEntries: Array<{ team: string; odds: number }> = [];
    for (let i = 0; i < scheduledRounds; i++) {
      const p = Math.max(finishProb * roundWeights[i], 0.005);
      roundEntries.push({ team: `r${i + 1}`, odds: 1 / p });
    }
    roundEntries.push({ team: "distance", odds: 1 / Math.max(decisionProb, 0.005) });
    const roundPriced = await applyOutrightMargin(roundEntries);
    for (const p of roundPriced) {
      const label = p.team === "distance" ? "Goes the distance" : `Round ${p.team.slice(1)}`;
      upserts.push({ fight_id: fightRow.id, market_type: "round", selection_key: p.team, label, odds: p.odds, is_active: true, updated_at: nowIso });
      snapshots.push({ fight_id: fightRow.id, market_type: "round", selection_key: p.team, odds: p.odds });
    }


    if (upserts.length) {
      const { error: marketsError } = await (supabaseAdmin as any)
        .from("ufc_fight_markets")
        .upsert(upserts, { onConflict: "fight_id,market_type,selection_key" });
      if (marketsError) throw new Error(`market save failed: ${marketsError.message}`);
      const { error: snapshotsError } = await (supabaseAdmin as any).from("ufc_market_snapshots").insert(snapshots);
      if (snapshotsError) throw new Error(`snapshot save failed: ${snapshotsError.message}`);
      totalMarkets += upserts.length;
    }
  }

  await (supabaseAdmin as any).from("audit_log").insert({
    user_id: null,
    action: "ufc.odds_sync",
    entity: "ufc_events",
    entity_id: event.id,
    metadata: { fights: lastTwo.length, markets: totalMarkets },
  });

  return { ok: true, fights: lastTwo.length, markets: totalMarkets };
}

// Silence unused import
void getRealOddsMarginSettings;
