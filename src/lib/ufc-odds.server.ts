// Server-only: pull UFC fights, fighters, odds, stats from API-Sports MMA
// (https://v1.mma.api-sports.io) and persist to ufc_fights, ufc_fighters,
// ufc_fight_markets, ufc_market_snapshots, ufc_fight_stats, ufc_fight_h2h.
//
// Bookmaker odds are real (bet365/Pinnacle/Betfair preferred). Selection
// keys match the settlement RPC contract:
//   moneyline: 'a' | 'b'
//   method   : '{a|b}_{ko_tko|submission|decision}'
//   round    : 'r1'..'r5' | 'distance'
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { applyOutrightMargin } from "@/lib/odds-margin.server";
import {
  fetchFightsByDate,
  fetchOddsForFight,
  fetchFighter,
  fetchFighterRecords,
  fetchFightStats,
  parseCm,
  type ApiMmaFight,
} from "@/lib/apimma.server";


export type UfcSyncResult = {
  ok: boolean;
  skipped?: string;
  fights?: number;
  markets?: number;
  error?: string;
};

function normalizeFighterName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function cleanDisplayText(value?: string | null) {
  if (!value) return value ?? null;
  return value
    .replace(/BenoÃ®t/g, "Benoît")
    .replace(/Saint Denis/g, "Saint Denis");
}

async function apply2WayMargin(a: number, b: number) {
  const priced = await applyOutrightMargin([
    { team: "a", odds: a },
    { team: "b", odds: b },
  ]);
  return {
    a: priced.find((p) => p.team === "a")!.odds,
    b: priced.find((p) => p.team === "b")!.odds,
  };
}

// Try to find UFC fights near a target timestamp. Returns fights sorted by
// commence time; caller filters main + co-main.
async function findEventFights(targetIso: string): Promise<ApiMmaFight[]> {
  const target = new Date(targetIso);
  const days: string[] = [];
  // Search ±1 day window to handle timezone crossing (Malaysia = UTC+8).
  for (let d = -1; d <= 1; d++) {
    const dt = new Date(target.getTime() + d * 24 * 60 * 60 * 1000);
    days.push(dt.toISOString().slice(0, 10));
  }
  const seen = new Map<number, ApiMmaFight>();
  for (const day of days) {
    try {
      const fights = await fetchFightsByDate(day);
      for (const f of fights) {
        // Only UFC events (slug starts with "UFC")
        if (!f.slug?.toUpperCase().startsWith("UFC")) continue;
        if (f.status.short === "CANC") continue;
        // Skip TBA placeholder cards
        const nm = `${f.fighters.first.name} ${f.fighters.second.name}`.toLowerCase();
        if (nm.includes("tba") || nm.includes("opponent")) continue;
        seen.set(f.id, f);
      }
    } catch (e) {
      console.error("api-mma date fetch failed", day, e);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.timestamp - b.timestamp);
}

// Cluster by UTC date and pick cluster closest to targetIso.
function pickCard(fights: ApiMmaFight[], targetIso: string): ApiMmaFight[] {
  const clusters = new Map<string, ApiMmaFight[]>();
  for (const f of fights) {
    const key = f.date.slice(0, 10);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(f);
  }
  const target = new Date(targetIso).getTime();
  let best: { fights: ApiMmaFight[]; delta: number } | null = null;
  for (const [, list] of clusters) {
    const ts = new Date(list[0].date).getTime();
    const delta = Math.abs(ts - target);
    if (!best || delta < best.delta) best = { fights: list, delta };
  }
  return best?.fights ?? [];
}

function fightMatchesEventTitle(fight: ApiMmaFight) {
  const [, title = ""] = (fight.slug ?? "").split(":");
  if (!title.trim()) return false;
  const normalizedTitle = normalizeFighterName(title);
  const first = normalizeFighterName(fight.fighters.first.name).replace(/^(the|a)/, "");
  const second = normalizeFighterName(fight.fighters.second.name).replace(/^(the|a)/, "");
  const firstLast = normalizeFighterName(fight.fighters.first.name.split(" ").slice(-1)[0] ?? "");
  const secondLast = normalizeFighterName(fight.fighters.second.name.split(" ").slice(-1)[0] ?? "");
  return (
    (normalizedTitle.includes(first) && normalizedTitle.includes(second)) ||
    (normalizedTitle.includes(firstLast) && normalizedTitle.includes(secondLast))
  );
}

function pickMainAndCoMain(card: ApiMmaFight[]) {
  const sorted = [...card].sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
  const mainCard = sorted.filter((f) => f.is_main);
  const candidates = mainCard.length >= 2 ? mainCard : sorted;
  const latestTs = Math.max(...candidates.map((f) => f.timestamp));
  const latest = candidates.filter((f) => f.timestamp === latestTs);
  const mainFight = latest.find(fightMatchesEventTitle) ?? latest[0] ?? candidates[candidates.length - 1];
  const coMainFight = [...candidates]
    .filter((f) => f.id !== mainFight.id)
    .sort((a, b) => b.timestamp - a.timestamp || b.id - a.id)[0] ?? null;
  return { mainFight, coMainFight };
}

async function upsertFighter(apimmaId: number, name: string, logo?: string) {
  // Try to enrich with /fighters details, but tolerate failure (rate-limits).
  let detail: Awaited<ReturnType<typeof fetchFighter>> | null = null;
  try {
    detail = await fetchFighter(apimmaId);
  } catch (e) {
    console.warn("fetchFighter failed", apimmaId, (e as Error).message);
  }
  const payload = {
    apimma_id: apimmaId,
    name: cleanDisplayText(detail?.name || name),
    nickname: detail?.nickname ?? null,
    record_w: detail?.record?.wins ?? null,
    record_l: detail?.record?.losses ?? null,
    record_d: detail?.record?.draws ?? null,
    reach_cm: parseCm(detail?.reach ?? null),
    height_cm: parseCm(detail?.height ?? null),
    stance: detail?.stance ?? null,
    dob: detail?.birth_date ?? null,
    weight_class: cleanDisplayText(detail?.category ?? null),
    country: detail?.country ?? null,
    photo_url: detail?.photo ?? logo ?? null,
  };
  const { data: existing } = await (supabaseAdmin as any)
    .from("ufc_fighters")
    .select("id")
    .eq("apimma_id", apimmaId)
    .maybeSingle();
  if (existing?.id) {
    await (supabaseAdmin as any).from("ufc_fighters").update(payload).eq("id", existing.id);
    return existing.id as string;
  }
  const { data } = await (supabaseAdmin as any)
    .from("ufc_fighters")
    .insert(payload)
    .select("id")
    .maybeSingle();
  return data?.id as string;
}

async function saveFight(input: {
  eventId: string;
  apimmaFight: ApiMmaFight;
  cardPosition: "main" | "co_main" | "other";
  scheduledRounds: 3 | 5;
}) {
  const f = input.apimmaFight;
  const payload = {
    event_id: input.eventId,
    apimma_fight_id: f.id,
    apimma_fighter_a_id: f.fighters.first.id,
    apimma_fighter_b_id: f.fighters.second.id,
    fighter_a: cleanDisplayText(f.fighters.first.name),
    fighter_b: cleanDisplayText(f.fighters.second.name),
    fighter_a_logo: f.fighters.first.logo ?? null,
    fighter_b_logo: f.fighters.second.logo ?? null,
    commence_time: f.date,
    card_position: input.cardPosition,
    scheduled_rounds: input.scheduledRounds,
    weight_class: cleanDisplayText(f.category ?? null),
    is_title_fight: /title|championship/i.test(f.slug ?? ""),
  };

  const { data: existing } = await (supabaseAdmin as any)
    .from("ufc_fights")
    .select("id")
    .eq("apimma_fight_id", f.id)
    .maybeSingle();

  const q = existing?.id
    ? (supabaseAdmin as any).from("ufc_fights").update(payload).eq("id", existing.id)
    : (supabaseAdmin as any).from("ufc_fights").insert(payload);
  const { data, error } = await q
    .select("id, fighter_a, fighter_b, scheduled_rounds")
    .maybeSingle();
  if (error) throw new Error(`fight save failed: ${error.message}`);
  return data as { id: string; fighter_a: string; fighter_b: string; scheduled_rounds: 3 | 5 };
}

// ---- Odds mapping ----

function median(nums: number[]) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function syncOddsForFight(fightRow: {
  id: string;
  fighter_a: string;
  fighter_b: string;
  scheduled_rounds: 3 | 5;
}, apimmaFightId: number) {
  let odds;
  try {
    odds = await fetchOddsForFight(apimmaFightId);
  } catch (e) {
    console.warn("fetchOdds failed", apimmaFightId, (e as Error).message);
    return 0;
  }
  if (!odds?.bookmakers?.length) return 0;

  const nowIso = new Date().toISOString();
  const upserts: any[] = [];
  const snapshots: any[] = [];

  const fA = normalizeFighterName(fightRow.fighter_a);
  const fB = normalizeFighterName(fightRow.fighter_b);

  const nameSideOf = (text: string): "a" | "b" | null => {
    const n = normalizeFighterName(text);
    if (!n) return null;
    if (n === fA || n.includes(fA) || fA.includes(n)) return "a";
    if (n === fB || n.includes(fB) || fB.includes(n)) return "b";
    const lowered = text.toLowerCase();
    if (/\bhome\b|\bfighter\s*1\b|^1$/.test(lowered)) return "a";
    if (/\baway\b|\bfighter\s*2\b|^2$/.test(lowered)) return "b";
    return null;
  };
  const methodBucketOf = (text: string): "ko_tko" | "submission" | "decision" | null => {
    const s = text.toLowerCase();
    if (/(ko|tko|knockout|technical\s*knock)/.test(s)) return "ko_tko";
    if (/(sub|submission|tap|choke|lock)/.test(s)) return "submission";
    if (/(decision|points|dec\.|unanimous|split|majority)/.test(s)) return "decision";
    return null;
  };

  // Aggregate across ALL bookmakers so no single provider gap kills a market.
  const mlPrices: Record<"a" | "b", number[]> = { a: [], b: [] };
  const methodPrices: Record<string, number[]> = {
    a_ko_tko: [], a_submission: [], a_decision: [],
    b_ko_tko: [], b_submission: [], b_decision: [],
  };
  const roundPrices: Record<string, number[]> = {};
  const pushRoundValue = (rawValue: string, price: number) => {
    if (!Number.isFinite(price) || price <= 1) return;
    const val = rawValue.toLowerCase();
    let key: string | null = null;
    if (/distance|goes.*distance|go\s*the\s*distance|decision\s*only|full\s*time/.test(val)) key = "distance";
    else {
      const m = val.match(/round\s*(\d+)|(\d+)(?:st|nd|rd|th)\s*round|^\s*(\d+)\s*$/);
      const num = m ? m[1] ?? m[2] ?? m[3] : null;
      if (num) {
        const n = Number(num);
        if (n >= 1 && n <= 5) key = `r${n}`;
      }
    }
    if (!key) return;
    if (!roundPrices[key]) roundPrices[key] = [];
    roundPrices[key].push(price);
  };

  for (const bm of odds.bookmakers) {
    if (!bm?.bets?.length) continue;

    // ---- Moneyline ----
    const mlBet = bm.bets.find((b: any) => b.id === 2) ?? bm.bets.find((b: any) => b.id === 1);
    if (mlBet) {
      for (const v of mlBet.values) {
        const val = String(v.value).toLowerCase();
        const price = Number(v.odd);
        if (!Number.isFinite(price) || price <= 1) continue;
        if (val === "home" || val === "1") mlPrices.a.push(price);
        else if (val === "away" || val === "2") mlPrices.b.push(price);
        else {
          const side = nameSideOf(v.value);
          if (side) mlPrices[side].push(price);
        }
      }
    }
    // Some feeds list "Fight Winner" or similar by fighter name only
    for (const bet of bm.bets) {
      const nm = (bet.name ?? "").toLowerCase();
      if (bet.id === 2 || bet.id === 1) continue;
      if (!/(fight\s*winner|to\s*win\s*fight|match\s*winner|winner)/.test(nm)) continue;
      for (const v of bet.values) {
        const price = Number(v.odd);
        if (!Number.isFinite(price) || price <= 1) continue;
        const side = nameSideOf(v.value);
        if (side) mlPrices[side].push(price);
      }
    }

    // ---- Method by known IDs ----
    const captureMethod = (betId: number, slot: "a" | "b", method: "ko_tko" | "submission" | "decision") => {
      const bet = bm.bets.find((b: any) => b.id === betId);
      if (!bet) return;
      for (const v of bet.values) {
        const p = Number(v.odd);
        if (Number.isFinite(p) && p > 1) methodPrices[`${slot}_${method}`].push(p);
      }
    };
    captureMethod(17, "a", "submission");
    captureMethod(18, "a", "ko_tko");
    captureMethod(19, "b", "submission");
    captureMethod(20, "b", "ko_tko");
    const combineDec = (unanimousId: number, splitId: number, slot: "a" | "b") => {
      const u = bm.bets.find((b: any) => b.id === unanimousId);
      const s = bm.bets.find((b: any) => b.id === splitId);
      if (!u && !s) return;
      let p = 0;
      for (const bet of [u, s]) {
        if (!bet) continue;
        for (const v of bet.values) {
          const price = Number(v.odd);
          if (Number.isFinite(price) && price > 1) p += 1 / price;
        }
      }
      if (p > 0) methodPrices[`${slot}_decision`].push(1 / p);
    };
    combineDec(13, 14, "a");
    combineDec(15, 16, "b");

    // ---- Method name-based fallback ----
    for (const bet of bm.bets) {
      const nm = (bet.name ?? "").toLowerCase();
      if (!/method|victory|winning\s*method|way\s*of|end\s*by|result/.test(nm)) continue;
      for (const v of bet.values) {
        const price = Number(v.odd);
        if (!Number.isFinite(price) || price <= 1) continue;
        const slot = nameSideOf(v.value);
        const bucket = methodBucketOf(v.value);
        if (!slot || !bucket) continue;
        methodPrices[`${slot}_${bucket}`].push(price);
      }
    }

    // ---- Round Betting ----
    const roundBetById = bm.bets.find((b: any) => b.id === 6);
    if (roundBetById) {
      for (const v of roundBetById.values) pushRoundValue(v.value, Number(v.odd));
    }
    for (const bet of bm.bets) {
      const nm = (bet.name ?? "").toLowerCase();
      if (bet.id === 6) continue;
      if (!/round|distance/.test(nm)) continue;
      for (const v of bet.values) pushRoundValue(v.value, Number(v.odd));
    }

    // ---- "Fight to go the distance" (Yes → distance) ----
    for (const bet of bm.bets) {
      const nm = (bet.name ?? "").toLowerCase();
      if (!/go\s*the\s*distance|goes\s*the\s*distance|fight\s*to\s*(go|end)/.test(nm)) continue;
      for (const v of bet.values) {
        const val = String(v.value).toLowerCase();
        const price = Number(v.odd);
        if (!Number.isFinite(price) || price <= 1) continue;
        if (/^yes$|distance/.test(val)) {
          if (!roundPrices["distance"]) roundPrices["distance"] = [];
          roundPrices["distance"].push(price);
        }
      }
    }
  }

  // ---- Persist Moneyline ----
  if (mlPrices.a.length && mlPrices.b.length) {
    const priced = await apply2WayMargin(median(mlPrices.a), median(mlPrices.b));
    upserts.push(
      { fight_id: fightRow.id, market_type: "moneyline", selection_key: "a", label: fightRow.fighter_a, odds: priced.a, is_active: true, updated_at: nowIso },
      { fight_id: fightRow.id, market_type: "moneyline", selection_key: "b", label: fightRow.fighter_b, odds: priced.b, is_active: true, updated_at: nowIso },
    );
    snapshots.push(
      { fight_id: fightRow.id, market_type: "moneyline", selection_key: "a", odds: priced.a },
      { fight_id: fightRow.id, market_type: "moneyline", selection_key: "b", odds: priced.b },
    );
  }

  // ---- Persist Method ----
  const methodEntries: Array<{ team: string; odds: number }> = [];
  for (const [key, prices] of Object.entries(methodPrices)) {
    if (prices.length) methodEntries.push({ team: key, odds: median(prices) });
  }
  if (methodEntries.length >= 2) {
    const priced = await applyOutrightMargin(methodEntries);
    for (const p of priced) {
      const [slot, ...rest] = p.team.split("_");
      const m = rest.join("_");
      const fighter = slot === "a" ? fightRow.fighter_a : fightRow.fighter_b;
      const label = `${fighter} by ${m === "ko_tko" ? "KO/TKO" : m === "submission" ? "Submission" : "Decision"}`;
      upserts.push({ fight_id: fightRow.id, market_type: "method", selection_key: p.team, label, odds: p.odds, is_active: true, updated_at: nowIso });
      snapshots.push({ fight_id: fightRow.id, market_type: "method", selection_key: p.team, odds: p.odds });
    }
  }

  // ---- Persist Round ----
  const roundEntries = Object.entries(roundPrices).map(([k, arr]) => ({ team: k, odds: median(arr) }));
  if (roundEntries.length >= 2) {
    const priced = await applyOutrightMargin(roundEntries);
    for (const p of priced) {
      const label = p.team === "distance" ? "Goes the distance" : `Round ${p.team.slice(1)}`;
      upserts.push({ fight_id: fightRow.id, market_type: "round", selection_key: p.team, label, odds: p.odds, is_active: true, updated_at: nowIso });
      snapshots.push({ fight_id: fightRow.id, market_type: "round", selection_key: p.team, odds: p.odds });
    }
  }

  if (!upserts.length) return 0;
  const { error: mErr } = await (supabaseAdmin as any)
    .from("ufc_fight_markets")
    .upsert(upserts, { onConflict: "fight_id,market_type,selection_key" });
  if (mErr) throw new Error(`market save failed: ${mErr.message}`);

  // De-dupe snapshots
  const { data: last } = await (supabaseAdmin as any)
    .from("ufc_market_snapshots")
    .select("market_type, selection_key, odds")
    .eq("fight_id", fightRow.id)
    .order("sampled_at", { ascending: false })
    .limit(50);
  const lastMap = new Map<string, number>();
  for (const r of (last ?? []) as any[]) {
    const k = `${r.market_type}::${r.selection_key}`;
    if (!lastMap.has(k)) lastMap.set(k, Number(r.odds));
  }
  const fresh = snapshots.filter((s) => lastMap.get(`${s.market_type}::${s.selection_key}`) !== s.odds);
  if (fresh.length) {
    await (supabaseAdmin as any).from("ufc_market_snapshots").insert(fresh);
  }
  return upserts.length;
}


// ---- Fight stats (live) ----
async function syncFightStats(fightRowId: string, apimmaFightId: number) {
  try {
    const stats = await fetchFightStats(apimmaFightId);
    if (!stats?.length) return;
    const { data: fightRow } = await (supabaseAdmin as any)
      .from("ufc_fights")
      .select("apimma_fighter_a_id, apimma_fighter_b_id")
      .eq("id", fightRowId)
      .maybeSingle();
    if (!fightRow) return;
    for (const s of stats) {
      const slot: "a" | "b" | null =
        s.fighter.id === fightRow.apimma_fighter_a_id ? "a"
        : s.fighter.id === fightRow.apimma_fighter_b_id ? "b" : null;
      if (!slot) continue;
      const num = (t: string) => {
        const row = s.statistics.find((x) => x.type?.toLowerCase() === t.toLowerCase());
        if (!row) return null;
        const n = Number(String(row.value ?? "").replace(/[^\d.]/g, ""));
        return Number.isFinite(n) ? n : null;
      };
      const payload = {
        fight_id: fightRowId,
        fighter_slot: slot,
        strikes_landed: num("Strikes Landed") ?? num("Total Strikes Landed"),
        strikes_attempted: num("Strikes Attempted") ?? num("Total Strikes Attempted"),
        significant_strikes_landed: num("Significant Strikes Landed"),
        significant_strikes_attempted: num("Significant Strikes Attempted"),
        takedowns_landed: num("Takedowns Landed"),
        takedowns_attempted: num("Takedowns Attempted"),
        submission_attempts: num("Submission Attempts"),
        knockdowns: num("Knockdowns"),
        control_time_sec: num("Control Time"),
        raw: s.statistics,
      };
      await (supabaseAdmin as any)
        .from("ufc_fight_stats")
        .upsert(payload, { onConflict: "fight_id,fighter_slot" });
    }
  } catch (e) {
    console.warn("syncFightStats failed", apimmaFightId, (e as Error).message);
  }
}

// ---- H2H + recent form ----
async function syncH2H(fightRowId: string, aId: number, bId: number) {
  try {
    const [recA, recB] = await Promise.all([
      fetchFighterRecords(aId).catch(() => []),
      fetchFighterRecords(bId).catch(() => []),
    ]);

    const rows: any[] = [];

    // Direct H2H (from A's records where opponent is B)
    for (const r of recA) {
      const opp = r.fighters.first.id === aId ? r.fighters.second : r.fighters.first;
      if (opp.id !== bId) continue;
      const aWon = r.fighters.first.id === aId ? r.fighters.first.winner : r.fighters.second.winner;
      const bWon = r.fighters.first.id === bId ? r.fighters.first.winner : r.fighters.second.winner;
      const winner_slot = aWon ? "a" : bWon ? "b" : "draw";
      rows.push({
        fight_id: fightRowId,
        record_type: "direct",
        past_fight_apimma_id: r.id,
        date: r.date.slice(0, 10),
        event_name: cleanDisplayText(r.slug ?? null),
        winner_slot,
        fighter_slot: null,
        opponent_name: cleanDisplayText(opp.name),
        is_win: aWon ?? null,
        method: null,
        round: null,
      });
    }

    // Recent form: last 6 fights per fighter (excluding this upcoming fight itself)
    const pushForm = (records: Awaited<ReturnType<typeof fetchFighterRecords>>, selfId: number, slot: "a" | "b") => {
      const sorted = [...records]
        .filter((r) => r.status.short === "FT" || r.status.short === "AFT")
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 6);
      for (const r of sorted) {
        const isFirst = r.fighters.first.id === selfId;
        const self = isFirst ? r.fighters.first : r.fighters.second;
        const opp = isFirst ? r.fighters.second : r.fighters.first;
        rows.push({
          fight_id: fightRowId,
          record_type: slot === "a" ? "form_a" : "form_b",
          past_fight_apimma_id: r.id,
          date: r.date.slice(0, 10),
          event_name: cleanDisplayText(r.slug ?? null),
          winner_slot: null,
          fighter_slot: slot,
          opponent_name: cleanDisplayText(opp.name),
          is_win: self.winner ?? null,
          method: null,
          round: null,
        });
      }
    };
    pushForm(recA, aId, "a");
    pushForm(recB, bId, "b");

    if (rows.length) {
      await (supabaseAdmin as any)
        .from("ufc_fight_h2h")
        .upsert(rows, { onConflict: "fight_id,record_type,past_fight_apimma_id" });
    }
  } catch (e) {
    console.warn("syncH2H failed", (e as Error).message);
  }
}


export async function runUfcOddsSync(opts: { force?: boolean } = {}): Promise<UfcSyncResult> {
  const key = process.env.API_FOOTBALL_KEY?.trim();
  if (!key) return { ok: false, skipped: "API_FOOTBALL_KEY not set" };

  const { data: event } = await (supabaseAdmin as any)
    .from("ufc_events")
    .select("id, event_key, name, starts_at")
    .eq("is_active", true)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!event) return { ok: true, skipped: "no active event" };

  // Cost guard: only hit API within ±3 days of event start (or force).
  const startsAt = new Date(event.starts_at).getTime();
  const withinWindow = Math.abs(startsAt - Date.now()) < 3 * 24 * 60 * 60 * 1000;
  if (!opts.force && !withinWindow) return { ok: true, skipped: "outside event window" };

  const allFights = await findEventFights(event.starts_at);
  if (!allFights.length) return { ok: true, skipped: "no UFC fights found near event date" };

  const card = pickCard(allFights, event.starts_at);
  if (!card.length) return { ok: true, skipped: "no card cluster matched" };

  // API-MMA marks the main-card fights with is_main. The final two main-card
  // fights can share the same timestamp, so use the event title slug to keep
  // the named headline bout as main event.
  const { mainFight, coMainFight } = pickMainAndCoMain(card);

  const targets: Array<{ f: ApiMmaFight; pos: "main" | "co_main"; rounds: 3 | 5 }> = [
    { f: mainFight, pos: "main", rounds: 5 },
  ];
  if (coMainFight) targets.push({ f: coMainFight, pos: "co_main", rounds: 3 });

  let totalMarkets = 0;
  for (const t of targets) {
    // Upsert fighters (with detail enrichment)
    await upsertFighter(t.f.fighters.first.id, t.f.fighters.first.name, t.f.fighters.first.logo);
    await upsertFighter(t.f.fighters.second.id, t.f.fighters.second.name, t.f.fighters.second.logo);

    const fightRow = await saveFight({
      eventId: event.id,
      apimmaFight: t.f,
      cardPosition: t.pos,
      scheduledRounds: t.rounds,
    });

    totalMarkets += await syncOddsForFight(fightRow, t.f.id);
    await syncH2H(fightRow.id, t.f.fighters.first.id, t.f.fighters.second.id);
    // Live stats only when fight is in progress or finished
    if (["LIVE", "FT", "AFT"].includes(t.f.status.short)) {
      await syncFightStats(fightRow.id, t.f.id);
    }
  }

  // Cleanup: demote any fights on this event that aren't in the current card
  // (stale seed data, cancelled fights, replaced cards) to card_position='other'
  // so the /ufc page only shows real, current main + co-main.
  const keepIds = targets.map((t) => t.f.id);
  await (supabaseAdmin as any)
    .from("ufc_fights")
    .update({ card_position: "other" })
    .eq("event_id", event.id)
    .in("card_position", ["main", "co_main"])
    .not("apimma_fight_id", "in", `(${keepIds.join(",")})`);

  await (supabaseAdmin as any).from("audit_log").insert({
    user_id: null,
    action: "ufc.odds_sync",
    entity: "ufc_events",
    entity_id: event.id,
    metadata: { fights: targets.length, markets: totalMarkets, provider: "api-mma" },
  });

  return { ok: true, fights: targets.length, markets: totalMarkets };
}
