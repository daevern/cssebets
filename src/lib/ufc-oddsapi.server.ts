// Server-only: UFC schedule + moneyline pricing from The Odds API.
//
// Why this exists: API-Sports MMA (apimma.server.ts) is the richer feed —
// fighter photos, stats, H2H, results — but its plan only serves a narrow
// date window, so it cannot see UPCOMING cards. The Odds API has no such
// window, so we use it to discover the next cards and price them, and let
// API-Sports enrich/settle each card once it comes inside its window.
//
// Odds here are reference prices only: we strip the bookmaker overround and
// apply the CSSEBets house margin, same as every other product.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { applyOutrightMargin } from "@/lib/odds-margin.server";
import { deriveUfcSecondaryMarkets } from "@/lib/ufc-derived-markets.server";

const SPORT = "mma_mixed_martial_arts";
const BASE = "https://api.the-odds-api.com/v4";

type OddsApiOutcome = { name: string; price: number };
type OddsApiEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: Array<{
    key: string;
    markets?: Array<{ key: string; outcomes?: OddsApiOutcome[] }>;
  }>;
};

export type UfcOddsApiResult = {
  ok: boolean;
  skipped?: string;
  events?: number;
  fights?: number;
  markets?: number;
  error?: string;
};

/** Consensus decimal price across bookmakers (median beats mean for outliers). */
function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function consensus(ev: OddsApiEvent) {
  const home: number[] = [];
  const away: number[] = [];
  let books = 0;
  for (const b of ev.bookmakers ?? []) {
    const m = (b.markets ?? []).find((x) => x.key === "h2h");
    if (!m) continue;
    const h = (m.outcomes ?? []).find((o) => o.name === ev.home_team)?.price;
    const a = (m.outcomes ?? []).find((o) => o.name === ev.away_team)?.price;
    if (!h || !a || h <= 1 || a <= 1) continue;
    home.push(h);
    away.push(a);
    books++;
  }
  const h = median(home);
  const a = median(away);
  if (!h || !a) return null;
  return { home: h, away: a, books };
}

/** Group bouts into cards: everything starting within 18h of the earliest bout. */
function clusterCards(events: OddsApiEvent[]) {
  const sorted = [...events].sort(
    (x, y) => new Date(x.commence_time).getTime() - new Date(y.commence_time).getTime(),
  );
  const cards: OddsApiEvent[][] = [];
  for (const ev of sorted) {
    const t = new Date(ev.commence_time).getTime();
    const last = cards[cards.length - 1];
    const anchor = last ? new Date(last[0]!.commence_time).getTime() : null;
    if (last && anchor !== null && t - anchor <= 18 * 60 * 60 * 1000) last.push(ev);
    else cards.push([ev]);
  }
  return cards;
}

/**
 * Card order heuristic: the feed has no card-position field, so we order by
 * start time (main event closes the show) and use bookmaker coverage as the
 * tiebreak — headline bouts are priced by the most books.
 */
function orderCard(card: OddsApiEvent[]) {
  return [...card].sort((a, b) => {
    const t = new Date(b.commence_time).getTime() - new Date(a.commence_time).getTime();
    if (t !== 0) return t;
    return (b.bookmakers ?? []).length - (a.bookmakers ?? []).length;
  });
}

function cardKey(startsAt: string) {
  return `oddsapi-${startsAt.slice(0, 10)}`;
}

async function fetchUpcomingMma(apiKey: string): Promise<OddsApiEvent[]> {
  const url =
    `${BASE}/sports/${SPORT}/odds?apiKey=${apiKey}` +
    `&regions=us,uk,eu&markets=h2h&oddsFormat=decimal&dateFormat=iso`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`odds-api mma HTTP ${res.status}`);
  return (await res.json()) as OddsApiEvent[];
}

/**
 * Discover + price upcoming UFC cards from The Odds API.
 *
 * Minimum card size guards against small regional promotions that share this
 * feed: UFC numbered events and Fight Nights always run 8+ bouts.
 */
export async function runUfcOddsApiSync(
  opts: { minBouts?: number; maxCards?: number } = {},
): Promise<UfcOddsApiResult> {
  const apiKey = process.env.ODDS_API_KEY?.trim();
  if (!apiKey) return { ok: false, skipped: "ODDS_API_KEY not set" };

  let raw: OddsApiEvent[];
  try {
    raw = await fetchUpcomingMma(apiKey);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const now = Date.now();
  // Horizon guard: the feed parks undated future bouts on placeholder dates
  // (e.g. 31 Dec), which would otherwise cluster into a fake card.
  const horizon = now + 60 * 24 * 60 * 60 * 1000;
  const upcoming = raw.filter((e) => {
    const t = new Date(e.commence_time).getTime();
    return t > now - 6 * 60 * 60 * 1000 && t < horizon;
  });
  const minBouts = opts.minBouts ?? 6;
  const cards = clusterCards(upcoming)
    .filter((c) => c.length >= minBouts)
    .slice(0, opts.maxCards ?? 4);

  if (!cards.length) return { ok: true, events: 0, fights: 0, markets: 0, skipped: "no UFC-sized cards in feed" };

  let fightsWritten = 0;
  let marketsWritten = 0;

  for (const card of cards) {
    const startsAt = card[0]!.commence_time;
    const ordered = orderCard(card); // [main, co-main, ...]
    const main = ordered[0]!;
    const coMain = ordered[1];
    const event_key = cardKey(startsAt);
    const name = `UFC Fight Night: ${main.home_team} vs ${main.away_team}`;

    // Don't clobber a richer API-Sports event for the same night (it has the
    // real card name, e.g. "UFC 331"). Reuse that row instead.
    const dayStart = new Date(new Date(startsAt).getTime() - 18 * 60 * 60 * 1000).toISOString();
    const dayEnd = new Date(new Date(startsAt).getTime() + 18 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await (supabaseAdmin as any)
      .from("ufc_events")
      .select("id, event_key, name")
      .gte("starts_at", dayStart)
      .lte("starts_at", dayEnd)
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let eventId: string | null = existing?.id ?? null;
    if (!eventId) {
      const { data: ins, error } = await (supabaseAdmin as any)
        .from("ufc_events")
        .upsert(
          { event_key, name, starts_at: startsAt, is_active: true },
          { onConflict: "event_key" },
        )
        .select("id")
        .maybeSingle();
      if (error || !ins?.id) {
        console.warn("[ufc-oddsapi] event upsert failed", event_key, error?.message);
        continue;
      }
      eventId = ins.id;
    } else {
      // Only rename cards we created ourselves — never overwrite an official
      // API-Sports name like "UFC 331".
      const owned = String(existing?.event_key ?? "").startsWith("oddsapi-");
      await (supabaseAdmin as any)
        .from("ufc_events")
        .update({ is_active: true, ...(owned ? { name } : {}) })
        .eq("id", eventId);
    }

    for (const bout of card) {
      const price = consensus(bout);
      if (!price) continue;

      const isMain = bout.id === main.id;
      const isCoMain = !!coMain && bout.id === coMain.id;
      const { data: fightRow, error: fightErr } = await (supabaseAdmin as any)
        .from("ufc_fights")
        .upsert(
          {
            event_id: eventId,
            odds_api_event_id: bout.id,
            fighter_a: bout.home_team,
            fighter_b: bout.away_team,
            commence_time: bout.commence_time,
            card_position: isMain ? "main" : isCoMain ? "co_main" : "other",
            scheduled_rounds: isMain ? 5 : 3,
          },
          { onConflict: "odds_api_event_id" },
        )
        .select("id")
        .maybeSingle();
      if (fightErr || !fightRow?.id) {
        console.warn("[ufc-oddsapi] fight upsert failed", bout.id, fightErr?.message);
        continue;
      }
      fightsWritten++;

      const priced = await applyOutrightMargin([
        { team: "a", odds: price.home },
        { team: "b", odds: price.away },
      ]);
      const oddsA = priced.find((p) => p.team === "a")!.odds;
      const oddsB = priced.find((p) => p.team === "b")!.odds;
      const nowIso = new Date().toISOString();

      for (const [selection_key, label, odds] of [
        ["a", bout.home_team, oddsA],
        ["b", bout.away_team, oddsB],
      ] as const) {
        await (supabaseAdmin as any)
          .from("ufc_fight_markets")
          .upsert(
            {
              fight_id: fightRow.id,
              market_type: "moneyline",
              selection_key,
              label,
              odds,
              is_active: true,
              updated_at: nowIso,
            },
            { onConflict: "fight_id,market_type,selection_key" },
          );
        await (supabaseAdmin as any)
          .from("ufc_market_snapshots")
          .insert({ fight_id: fightRow.id, market_type: "moneyline", selection_key, odds });
        marketsWritten++;
      }

      // The Odds API plan only serves h2h for MMA, so derive Method / Round /
      // Total Rounds from the fresh moneyline. If API-Sports later prices the
      // same bout, its real numbers overwrite these rows.
      try {
        const derived = await deriveUfcSecondaryMarkets(fightRow.id);
        if (derived.ok) marketsWritten += derived.rows;
      } catch (e) {
        console.warn("[ufc-oddsapi] derive secondary markets failed", fightRow.id, (e as Error).message);
      }
    }
  }

  await (supabaseAdmin as any)
    .from("ufc_feed_state")
    .upsert({ id: true, last_odds_at: new Date().toISOString() }, { onConflict: "id" });

  return { ok: true, events: cards.length, fights: fightsWritten, markets: marketsWritten };
}
