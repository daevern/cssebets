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

  // Filter to events matching this event name (e.g. sport_title contains "UFC 329")
  const nameLower = event.name.toLowerCase();
  const eventFights = allEvents
    .filter((e) => (e.sport_title || "").toLowerCase().includes(nameLower))
    .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());

  // Fallback: if sport_title doesn't include the event name, take everything within ±12h of event.starts_at
  const target =
    eventFights.length > 0
      ? eventFights
      : allEvents
          .filter((e) => Math.abs(new Date(e.commence_time).getTime() - startsAt) < 12 * 60 * 60 * 1000)
          .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());

  if (!target.length) return { ok: true, skipped: "no fights found for event" };

  // Last two = co-main + main (main is last).
  const lastTwo = target.slice(-2);
  const [coMain, main] = lastTwo.length === 2 ? lastTwo : [null, lastTwo[0]];

  let totalMarkets = 0;
  const nowIso = new Date().toISOString();

  for (const ev of lastTwo) {
    const isMain = ev === main;
    const isCoMain = ev === coMain;
    const position = isMain ? "main" : isCoMain ? "co_main" : "other";
    const scheduledRounds = isMain ? 5 : 3;

    // Upsert fight row
    const { data: fightRow } = await (supabaseAdmin as any)
      .from("ufc_fights")
      .upsert(
        {
          event_id: event.id,
          odds_api_event_id: ev.id,
          fighter_a: ev.home_team,
          fighter_b: ev.away_team,
          commence_time: ev.commence_time,
          card_position: position,
          scheduled_rounds: scheduledRounds,
        },
        { onConflict: "odds_api_event_id" },
      )
      .select("id, fighter_a, fighter_b, scheduled_rounds")
      .maybeSingle();

    if (!fightRow) continue;

    // Fetch odds for this event with all three markets
    const oddsUrl =
      `${BASE}/${SPORT}/events/${ev.id}/odds` +
      `?apiKey=${apiKey}&regions=us,eu&markets=h2h,h2h_method,rounds&oddsFormat=decimal`;
    const oddsRes = await fetch(oddsUrl);
    if (!oddsRes.ok) continue;
    const eventOdds = (await oddsRes.json()) as EventOdds;

    // Aggregate per market
    const h2hA: number[] = [];
    const h2hB: number[] = [];
    const methodBuckets = new Map<string, number[]>(); // key: a_ko | a_sub | a_dec | b_ko | b_sub | b_dec
    const roundBuckets = new Map<string, number[]>(); // r1..rN | distance

    const normFighter = (name: string) =>
      name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const fA = normFighter(fightRow.fighter_a);
    const fB = normFighter(fightRow.fighter_b);
    const side = (n: string) => (normFighter(n) === fA ? "a" : normFighter(n) === fB ? "b" : null);

    for (const bm of eventOdds.bookmakers ?? []) {
      for (const mkt of bm.markets ?? []) {
        if (mkt.key === "h2h") {
          for (const o of mkt.outcomes) {
            const s = side(o.name);
            if (s === "a" && Number.isFinite(o.price)) h2hA.push(o.price);
            else if (s === "b" && Number.isFinite(o.price)) h2hB.push(o.price);
          }
        } else if (mkt.key === "h2h_method" || mkt.key === "method_of_victory") {
          for (const o of mkt.outcomes) {
            // Odds API for h2h_method: outcome.name = fighter, description = method (KO/TKO | Submission | Decision)
            const s = side(o.name);
            if (!s) continue;
            const desc = (o.description || "").toLowerCase();
            let methodKey: string | null = null;
            if (desc.includes("ko") || desc.includes("tko")) methodKey = "ko_tko";
            else if (desc.includes("sub")) methodKey = "submission";
            else if (desc.includes("dec") || desc.includes("points")) methodKey = "decision";
            if (!methodKey) continue;
            const key = `${s}_${methodKey}`;
            if (!methodBuckets.has(key)) methodBuckets.set(key, []);
            methodBuckets.get(key)!.push(o.price);
          }
        } else if (mkt.key === "rounds" || mkt.key === "round_betting") {
          for (const o of mkt.outcomes) {
            const label = (o.description || o.name || "").toLowerCase();
            let key: string | null = null;
            const rMatch = label.match(/round\s*(\d)/);
            if (rMatch) key = `r${rMatch[1]}`;
            else if (label.includes("distance") || label.includes("go the distance")) key = "distance";
            if (!key) continue;
            if (!roundBuckets.has(key)) roundBuckets.set(key, []);
            roundBuckets.get(key)!.push(o.price);
          }
        }
      }
    }

    // Compute + persist moneyline
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

    if (h2hA.length && h2hB.length) {
      const priced = await apply2WayMargin(median(h2hA), median(h2hB));
      upserts.push(
        { fight_id: fightRow.id, market_type: "moneyline", selection_key: "a", label: fightRow.fighter_a, odds: priced.a, is_active: true, updated_at: nowIso },
        { fight_id: fightRow.id, market_type: "moneyline", selection_key: "b", label: fightRow.fighter_b, odds: priced.b, is_active: true, updated_at: nowIso },
      );
      snapshots.push(
        { fight_id: fightRow.id, market_type: "moneyline", selection_key: "a", odds: priced.a },
        { fight_id: fightRow.id, market_type: "moneyline", selection_key: "b", odds: priced.b },
      );
    }

    // Method market — priced as an outright across all selections we saw
    if (methodBuckets.size >= 2) {
      const entries = Array.from(methodBuckets.entries()).map(([k, arr]) => ({ team: k, odds: median(arr) }));
      const priced = await applyOutrightMargin(entries);
      for (const p of priced) {
        const [s, m] = p.team.split("_");
        const fighter = s === "a" ? fightRow.fighter_a : fightRow.fighter_b;
        const methodLabel = m === "ko_tko" ? "KO/TKO" : m === "submission" ? "Submission" : "Decision";
        const label = `${fighter} by ${methodLabel}`;
        upserts.push({ fight_id: fightRow.id, market_type: "method", selection_key: p.team, label, odds: p.odds, is_active: true, updated_at: nowIso });
        snapshots.push({ fight_id: fightRow.id, market_type: "method", selection_key: p.team, odds: p.odds });
      }
    }

    // Round market — priced as an outright
    if (roundBuckets.size >= 2) {
      const entries = Array.from(roundBuckets.entries()).map(([k, arr]) => ({ team: k, odds: median(arr) }));
      const priced = await applyOutrightMargin(entries);
      for (const p of priced) {
        const label = p.team === "distance" ? "Goes the distance" : `Round ${p.team.slice(1)}`;
        upserts.push({ fight_id: fightRow.id, market_type: "round", selection_key: p.team, label, odds: p.odds, is_active: true, updated_at: nowIso });
        snapshots.push({ fight_id: fightRow.id, market_type: "round", selection_key: p.team, odds: p.odds });
      }
    }

    if (upserts.length) {
      await (supabaseAdmin as any)
        .from("ufc_fight_markets")
        .upsert(upserts, { onConflict: "fight_id,market_type,selection_key" });
      await (supabaseAdmin as any).from("ufc_market_snapshots").insert(snapshots);
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
