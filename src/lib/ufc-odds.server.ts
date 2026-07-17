// Server-only: pull UFC fights, fighters, odds, stats from API-Sports MMA
// (https://v1.mma.api-sports.io) and persist to ufc_fights, ufc_fighters,
// ufc_fight_markets, ufc_market_snapshots, ufc_fight_stats, ufc_fight_h2h.
//
// Bookmaker odds are real (bet365/Pinnacle/Betfair preferred). Selection
// keys match the settlement RPC contract:
//   moneyline: 'a' | 'b'
//   three_way: 'a' | 'draw' | 'b'
//   method   : '{a|b}_{ko_tko|submission|decision}'
//   round    : 'r1'..'r5' | 'distance'
//   total_rounds: 'over_1_5' | 'under_1_5' ...
//   handicap: '{a|b}_{plus|minus}_5_5'
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { applyOutrightMargin } from "@/lib/odds-margin.server";
import {
  fetchFightsByDate,
  fetchOddsForFight,
  fetchFighter,
  searchFighter,
  fetchFighterRecordSummary,
  fetchFighterFightHistory,
  fetchFightStats,
  parseCm,
  parseLbs,
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
  // Read existing row FIRST so a failed/empty detail lookup never overwrites
  // known-good tale-of-the-tape fields with nulls.
  const { data: existing } = await (supabaseAdmin as any)
    .from("ufc_fighters")
    .select("*")
    .eq("apimma_id", apimmaId)
    .maybeSingle();

  // Try /fighters?id=; on failure or empty response, fall back to name search.
  let detail: Awaited<ReturnType<typeof fetchFighter>> | null = null;
  let recordSummary: Awaited<ReturnType<typeof fetchFighterRecordSummary>> | null = null;
  try {
    [detail, recordSummary] = await Promise.all([
      fetchFighter(apimmaId),
      fetchFighterRecordSummary(apimmaId).catch(() => null),
    ]);
  } catch (e) {
    console.warn("fetchFighter failed", apimmaId, (e as Error).message);
  }
  if (!detail || (!detail.record && !detail.reach && !detail.height)) {
    try {
      const found = await searchFighter(name);
      if (found) detail = { ...(detail ?? {} as any), ...found };
    } catch (e) {
      console.warn("searchFighter failed", name, (e as Error).message);
    }
  }

  const coalesce = <T,>(next: T | null | undefined, prev: T | null | undefined): T | null =>
    (next ?? prev ?? null) as T | null;
  const total = recordSummary?.total;
  const ko = recordSummary?.ko;
  const sub = recordSummary?.sub;

  const payload = {
    apimma_id: apimmaId,
    name: cleanDisplayText(detail?.name || existing?.name || name),
    nickname: coalesce(detail?.nickname, existing?.nickname),
    record_w: coalesce(detail?.record?.wins ?? total?.win, existing?.record_w),
    record_l: coalesce(detail?.record?.losses ?? total?.loss, existing?.record_l),
    record_d: coalesce(detail?.record?.draws ?? total?.draw, existing?.record_d),
    reach_cm: coalesce(parseCm(detail?.reach ?? null), existing?.reach_cm),
    height_cm: coalesce(parseCm(detail?.height ?? null), existing?.height_cm),
    weight_lbs: coalesce(parseLbs(detail?.weight ?? null), existing?.weight_lbs),
    stance: coalesce(detail?.stance, existing?.stance),
    dob: coalesce(detail?.birth_date, existing?.dob),
    age_years: coalesce(detail?.age, existing?.age_years),
    weight_class: cleanDisplayText(coalesce(detail?.category, existing?.weight_class)),
    country: coalesce(detail?.country, existing?.country),
    birth_place: coalesce(detail?.birth_place, existing?.birth_place),
    gender: coalesce(detail?.gender, existing?.gender),
    team_name: coalesce(detail?.team?.name, existing?.team_name),
    ko_w: coalesce(ko?.win, existing?.ko_w),
    ko_l: coalesce(ko?.loss, existing?.ko_l),
    sub_w: coalesce(sub?.win, existing?.sub_w),
    sub_l: coalesce(sub?.loss, existing?.sub_l),
    photo_url: coalesce(detail?.photo ?? logo ?? null, existing?.photo_url),
  };
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

  const { data, error } = await (supabaseAdmin as any)
    .from("ufc_fights")
    .upsert(payload, { onConflict: "apimma_fight_id" })
    .select("id, fighter_a, fighter_b, scheduled_rounds, apimma_fighter_a_id, apimma_fighter_b_id")
    .maybeSingle();
  if (error) throw new Error(`fight save failed: ${error.message}`);
  return data as {
    id: string;
    fighter_a: string;
    fighter_b: string;
    scheduled_rounds: 3 | 5;
    apimma_fighter_a_id: number | null;
    apimma_fighter_b_id: number | null;
  };

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
  apimma_fighter_a_id: number | null;
  apimma_fighter_b_id: number | null;
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
  const threeWayPrices: Record<"a" | "draw" | "b", number[]> = { a: [], draw: [], b: [] };
  const methodPrices: Record<string, number[]> = {
    a_ko_tko: [], a_submission: [], a_decision: [],
    b_ko_tko: [], b_submission: [], b_decision: [],
  };
  const roundPrices: Record<string, number[]> = {};
  const handicapPrices: Record<string, { label: string; prices: number[] }> = {};
  // Over/Under total-rounds prices per boundary (1.5, 2.5, 3.5, 4.5) →
  // used to derive per-round finish odds when the API has no explicit
  // "Round Betting" market (which is the norm for API-Sports MMA).
  const ouOverPrices: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [] };
  const ouUnderPrices: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [] };
  const distancePrices: { yes: number[]; no: number[] } = { yes: [], no: [] };

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
  const parseHandicapSelection = (raw: string, price: number) => {
    if (!Number.isFinite(price) || price <= 1) return;
    const side = nameSideOf(raw);
    if (!side) return;
    const match = raw.match(/([+-])\s*(\d+(?:\.\d+)?)/);
    if (!match) return;
    const line = Number(match[2]);
    if (!Number.isFinite(line)) return;
    const sign = match[1] === "+" ? "plus" : "minus";
    const key = `${side}_${sign}_${String(line).replace(".", "_")}`;
    const fighter = side === "a" ? fightRow.fighter_a : fightRow.fighter_b;
    if (!handicapPrices[key]) handicapPrices[key] = { label: `${fighter} ${match[1]}${line}`, prices: [] };
    handicapPrices[key].prices.push(price);
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

    // ---- Fight Result / 3-way, including draw if offered ----
    const threeWayBet = bm.bets.find((b: any) => b.id === 1)
      ?? bm.bets.find((b: any) => /3\s*way|three\s*way|result/i.test(b.name ?? ""));
    if (threeWayBet) {
      for (const v of threeWayBet.values) {
        const val = String(v.value).toLowerCase();
        const price = Number(v.odd);
        if (!Number.isFinite(price) || price <= 1) continue;
        if (/draw|tie/.test(val)) threeWayPrices.draw.push(price);
        else {
          const side = nameSideOf(v.value);
          if (side) threeWayPrices[side].push(price);
        }
      }
    }

    // ---- Handicap / spread ----
    for (const bet of bm.bets) {
      const nm = (bet.name ?? "").toLowerCase();
      if (bet.id !== 3 && !/handicap|spread/.test(nm)) continue;
      for (const v of bet.values) parseHandicapSelection(v.value, Number(v.odd));
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

    // ---- Round Betting (explicit — rare on api-sports MMA) ----
    const roundBetById = bm.bets.find((b: any) => b.id === 6);
    if (roundBetById) {
      for (const v of roundBetById.values) pushRoundValue(v.value, Number(v.odd));
    }
    for (const bet of bm.bets) {
      const nm = (bet.name ?? "").toLowerCase();
      if (bet.id === 6) continue;
      if (!/round|distance/.test(nm) || /over|under|total/.test(nm)) continue;
      for (const v of bet.values) pushRoundValue(v.value, Number(v.odd));
    }

    // ---- Over/Under total rounds (used to derive per-round finish odds) ----
    const ouBet = bm.bets.find((b: any) => b.id === 4)
      ?? bm.bets.find((b: any) => /over.?under|total\s*rounds/i.test(b.name ?? ""));
    if (ouBet) {
      for (const v of ouBet.values) {
        const price = Number(v.odd);
        if (!Number.isFinite(price) || price <= 1) continue;
        const m = String(v.value).toLowerCase().match(/(over|under)\s*(\d+(?:\.\d+)?)/);
        if (!m) continue;
        const dir = m[1] as "over" | "under";
        const line = Math.floor(Number(m[2])); // 1.5 → 1, 2.5 → 2 ...
        if (!(line >= 1 && line <= 4)) continue;
        (dir === "over" ? ouOverPrices : ouUnderPrices)[line].push(price);
      }
    }

    // ---- "Fight to go the distance" (Yes/No) ----
    for (const bet of bm.bets) {
      const nm = (bet.name ?? "").toLowerCase();
      if (!/go\s*the\s*distance|goes\s*the\s*distance|fight\s*to\s*(go|end)/.test(nm)) continue;
      for (const v of bet.values) {
        const val = String(v.value).toLowerCase();
        const price = Number(v.odd);
        if (!Number.isFinite(price) || price <= 1) continue;
        if (/^yes$|^y$|distance/.test(val)) {
          distancePrices.yes.push(price);
          if (!roundPrices["distance"]) roundPrices["distance"] = [];
          roundPrices["distance"].push(price);
        } else if (/^no$|^n$|inside\s*distance|not\s*go/.test(val)) {
          distancePrices.no.push(price);
        }
      }
    }
  }


  // ---- Derive round-finish odds from Over/Under totals ----
  // Fair prob at each boundary: pUnder_k = (1/oddU_k) / (1/oddU_k + 1/oddO_k)
  //   r1 = pU_1
  //   r2 = pU_2 - pU_1
  //   r3 = pU_3 - pU_2
  //   r4 = pU_4 - pU_3         (5-round fights only)
  //   distance = 1 - pU_{last}
  const scheduledRounds = fightRow.scheduled_rounds ?? 3;
  const maxLine = scheduledRounds === 5 ? 4 : 2;
  const fairUnder: Record<number, number> = {};
  for (let k = 1; k <= maxLine; k++) {
    const u = median(ouUnderPrices[k]);
    const o = median(ouOverPrices[k]);
    if (u > 1 && o > 1) {
      const invU = 1 / u, invO = 1 / o;
      fairUnder[k] = invU / (invU + invO);
    }
  }
  const availableLines = Object.keys(fairUnder).map(Number).sort((a, b) => a - b);
  if (availableLines.length >= 1 && Object.keys(roundPrices).length === 0) {
    const roundProbs: Record<string, number> = {};
    let prev = 0;
    for (const k of availableLines) {
      const cur = fairUnder[k];
      const p = Math.max(0.001, cur - prev);
      roundProbs[`r${k}`] = p;
      prev = cur;
    }
    const lastLine = availableLines[availableLines.length - 1];
    // "distance" = fight goes past the last measured boundary. For 3-round =
    // Over 2.5, for 5-round = Over 4.5.
    const distanceProb = Math.max(0.001, 1 - fairUnder[lastLine]);
    roundProbs["distance"] = distanceProb;
    for (const [key, p] of Object.entries(roundProbs)) {
      roundPrices[key] = [1 / p];
    }
  }

  const distanceLine = scheduledRounds === 5 ? 4 : 2;
  if (!distancePrices.yes.length && !distancePrices.no.length) {
    const overDistance = median(ouOverPrices[distanceLine]);
    const underDistance = median(ouUnderPrices[distanceLine]);
    if (overDistance > 1 && underDistance > 1) {
      distancePrices.yes.push(overDistance);
      distancePrices.no.push(underDistance);
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

  // ---- Fight Result (3-way) and Handicap intentionally NOT persisted ----
  // Product decision: the 3-way market duplicates moneyline (draws/NC void
  // moneyline anyway) and MMA scorecard handicaps confuse users. Aggregation
  // above still runs cheaply so we can revisit later without a schema change.

  // ---- Persist Method of Victory ----
  // Prefer real bookmaker prices when present. Otherwise synthesise from the
  // live moneyline + distance/total-rounds market so the tile always tracks
  // reality (recomputed every sync). To avoid quoting stale prices right at
  // walk-outs, freeze the market 30 minutes before commence_time — we stop
  // recomputing and deactivate any existing method rows for the fight.
  const METHOD_LOCK_MS = 30 * 60 * 1000;
  const { data: fightMeta } = await (supabaseAdmin as any)
    .from("ufc_fights")
    .select("commence_time")
    .eq("id", fightRow.id)
    .maybeSingle();
  const commenceMs = fightMeta?.commence_time ? new Date(fightMeta.commence_time).getTime() : 0;
  const methodLocked = commenceMs > 0 && (commenceMs - Date.now()) <= METHOD_LOCK_MS;

  const methodEntries: Array<{ team: string; odds: number }> = [];
  for (const [key, prices] of Object.entries(methodPrices)) {
    if (prices.length) methodEntries.push({ team: key, odds: median(prices) });
  }
  const feedProvidedMethod = methodEntries.length >= 2;

  // Synthesise when feed is silent AND market isn't locked.
  if (!feedProvidedMethod && !methodLocked && mlPrices.a.length && mlPrices.b.length) {
    // Fair win probs from moneyline.
    const mA = median(mlPrices.a), mB = median(mlPrices.b);
    const invA = 1 / mA, invB = 1 / mB;
    const sumM = invA + invB;
    const pA = invA / sumM, pB = invB / sumM;
    // Fair distance prob: prefer explicit distance market, else derive from
    // total_rounds boundary.
    let pDistance = 0;
    const yesD = median(distancePrices.yes), noD = median(distancePrices.no);
    if (yesD > 1 && noD > 1) {
      const iy = 1 / yesD, ino = 1 / noD;
      pDistance = iy / (iy + ino);
    } else if (fairUnder[distanceLine] !== undefined) {
      pDistance = Math.max(0.001, 1 - fairUnder[distanceLine]);
    }
    if (pDistance > 0.02 && pDistance < 0.98) {
      const pFinish = 1 - pDistance;
      // KO/TKO vs Submission per-fighter split from career mix.
      const { data: fA_rec } = await (supabaseAdmin as any)
        .from("ufc_fighters").select("ko_w, sub_w").eq("apimma_id", fightRow.apimma_fighter_a_id).maybeSingle();
      const { data: fB_rec } = await (supabaseAdmin as any)
        .from("ufc_fighters").select("ko_w, sub_w").eq("apimma_id", fightRow.apimma_fighter_b_id).maybeSingle();
      // KO/Sub split per fighter with Bayesian smoothing toward a UFC-wide
      // prior (~65% KO / 35% Sub among finishes). Prevents absurd odds for
      // fighters whose historical mix is lopsided (e.g. Conor McGregor has
      // essentially zero submissions → raw mix gives 78x for "by Submission").
      const PRIOR_KO = 6.5, PRIOR_SUB = 3.5; // 10 pseudo-finishes @ 65/35
      const finishMix = (rec: any): { ko: number; sub: number } => {
        const ko = Number(rec?.ko_w ?? 0), sub = Number(rec?.sub_w ?? 0);
        const t = ko + sub + PRIOR_KO + PRIOR_SUB;
        return { ko: (ko + PRIOR_KO) / t, sub: (sub + PRIOR_SUB) / t };
      };
      const mixA = finishMix(fA_rec);
      const mixB = finishMix(fB_rec);
      const pA_finish = pFinish * pA;
      const pB_finish = pFinish * pB;
      const probs: Record<string, number> = {
        a_ko_tko: Math.max(0.01, pA_finish * mixA.ko),
        a_submission: Math.max(0.01, pA_finish * mixA.sub),
        a_decision: Math.max(0.01, pDistance * pA),
        b_ko_tko: Math.max(0.01, pB_finish * mixB.ko),
        b_submission: Math.max(0.01, pB_finish * mixB.sub),
        b_decision: Math.max(0.01, pDistance * pB),
      };
      for (const [k, p] of Object.entries(probs)) methodEntries.push({ team: k, odds: 1 / p });
    }
  }

  if (methodEntries.length >= 2 && !methodLocked) {
    const priced = await applyOutrightMargin(methodEntries);
    // Cap at 40x — real bookmakers rarely quote method-of-victory above this,
    // and it protects the platform from long-tail synthesis noise.
    const METHOD_MAX_ODDS = 40;
    for (const p of priced) {
      const [slot, ...rest] = p.team.split("_");
      const m = rest.join("_");
      const fighter = slot === "a" ? fightRow.fighter_a : fightRow.fighter_b;
      const label = `${fighter} by ${m === "ko_tko" ? "KO/TKO" : m === "submission" ? "Submission" : "Decision"}`;
      const capped = Math.min(METHOD_MAX_ODDS, Number(p.odds));
      upserts.push({ fight_id: fightRow.id, market_type: "method", selection_key: p.team, label, odds: capped, is_active: true, updated_at: nowIso });
      snapshots.push({ fight_id: fightRow.id, market_type: "method", selection_key: p.team, odds: capped });
    }
  }






  // ---- Persist Round (advanced — shown under "More markets") ----
  const roundEntries = Object.entries(roundPrices).map(([k, arr]) => ({ team: k, odds: median(arr) }));
  if (roundEntries.length >= 2) {
    const priced = await applyOutrightMargin(roundEntries);
    for (const p of priced) {
      const label = p.team === "distance" ? "Goes the distance" : `Round ${p.team.slice(1)}`;
      upserts.push({ fight_id: fightRow.id, market_type: "round", selection_key: p.team, label, odds: p.odds, is_active: true, updated_at: nowIso });
      snapshots.push({ fight_id: fightRow.id, market_type: "round", selection_key: p.team, odds: p.odds });
    }
  }

  // ---- Persist Total Rounds — restricted to key lines only (2.5 always;
  //      4.5 only on 5-round fights). Too many O/U lines crowd the page. ----
  const totalLines = scheduledRounds === 5 ? [2, 4] : [2];
  for (const k of totalLines) {
    let over = median(ouOverPrices[k]);
    let under = median(ouUnderPrices[k]);
    // Fallback: if only one side is priced, derive the other from the fair
    // probability we already computed so users never see a half-market.
    // This is why "Under 4.5" used to disappear on some feeds.
    if ((!over || over <= 1) && fairUnder[k] !== undefined && under > 1) {
      over = 1 / Math.max(0.01, 1 - fairUnder[k]);
    }
    if ((!under || under <= 1) && fairUnder[k] !== undefined && over > 1) {
      under = 1 / Math.max(0.01, fairUnder[k]);
    }
    if (over > 1 && under > 1) {
      const priced = await apply2WayMargin(over, under);
      const line = `${k}_5`;
      const lineLabel = `${k}.5`;
      upserts.push(
        { fight_id: fightRow.id, market_type: "total_rounds", selection_key: `over_${line}`, label: `Over ${lineLabel} rounds`, odds: priced.a, is_active: true, updated_at: nowIso },
        { fight_id: fightRow.id, market_type: "total_rounds", selection_key: `under_${line}`, label: `Under ${lineLabel} rounds`, odds: priced.b, is_active: true, updated_at: nowIso },
      );
      snapshots.push(
        { fight_id: fightRow.id, market_type: "total_rounds", selection_key: `over_${line}`, odds: priced.a },
        { fight_id: fightRow.id, market_type: "total_rounds", selection_key: `under_${line}`, odds: priced.b },
      );
    }
  }


  // ---- Distance market retired (product decision).
  // distancePrices are still aggregated above and used internally to derive
  // Method-of-Victory synthesis; we just don't publish it as a user market.




  // Deactivate any previously-persisted three_way / handicap / distance rows
  // so the client hides them (product removed these market types from the UI).
  await (supabaseAdmin as any)
    .from("ufc_fight_markets")
    .update({ is_active: false })
    .eq("fight_id", fightRow.id)
    .in("market_type", ["three_way", "handicap", "distance"]);


  // Also deactivate any total_rounds lines we no longer surface (only 2.5
  // for 3-round fights; 2.5 and 4.5 for 5-round fights).
  const keepKeys = (scheduledRounds === 5 ? [2, 4] : [2])
    .flatMap((k) => [`over_${k}_5`, `under_${k}_5`]);
  await (supabaseAdmin as any)
    .from("ufc_fight_markets")
    .update({ is_active: false })
    .eq("fight_id", fightRow.id)
    .eq("market_type", "total_rounds")
    .not("selection_key", "in", `(${keepKeys.map((k) => `"${k}"`).join(",")})`);

  // If the market is locked (T-30min) or nothing to publish, deactivate any
  // previously-persisted method rows so the UI hides / disables the tab.
  if (methodLocked || methodEntries.length < 2) {
    await (supabaseAdmin as any)
      .from("ufc_fight_markets")
      .update({ is_active: false })
      .eq("fight_id", fightRow.id)
      .eq("market_type", "method");
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
async function syncH2H(fightRowId: string, aId: number, bId: number, currentApimmaFightId: number) {
  try {
    const [recA, recB] = await Promise.all([
      fetchFighterFightHistory(aId, 16).catch(() => []),
      fetchFighterFightHistory(bId, 16).catch(() => []),
    ]);

    const rows: any[] = [];

    // Direct H2H (from A's records where opponent is B)
    for (const r of recA) {
      if (r.id === currentApimmaFightId) continue;
      if (r.status.short !== "FT" && r.status.short !== "AFT") continue;
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
    const pushForm = (records: Awaited<ReturnType<typeof fetchFighterFightHistory>>, selfId: number, slot: "a" | "b") => {
      const sorted = [...records]
        .filter((r) => r.id !== currentApimmaFightId)
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

    await (supabaseAdmin as any).from("ufc_fight_h2h").delete().eq("fight_id", fightRowId);
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

  // Include the full main card, not just headliner + co-main. API-MMA's
  // `is_main` flag marks every main-card bout; fall back to the whole card
  // cluster if the feed hasn't tagged them yet.
  const mainCardFights = card.filter((f) => f.is_main);
  const fullCard = mainCardFights.length >= 2 ? mainCardFights : card;

  const targets: Array<{ f: ApiMmaFight; pos: "main" | "co_main" | "other"; rounds: 3 | 5 }> = [
    { f: mainFight, pos: "main", rounds: 5 },
  ];
  if (coMainFight) targets.push({ f: coMainFight, pos: "co_main", rounds: 3 });
  for (const f of fullCard) {
    if (f.id === mainFight.id) continue;
    if (coMainFight && f.id === coMainFight.id) continue;
    targets.push({ f, pos: "other", rounds: 3 });
  }

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
    await syncH2H(fightRow.id, t.f.fighters.first.id, t.f.fighters.second.id, t.f.id);
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

// ---------------------------------------------------------------------------
// Auto-settle winner markets (moneyline + three_way) from the MMA feed.
//
// API-Sports MMA exposes `winner: boolean` on each fighter for finished fights
// (status.short in {FT, AFT}) but does NOT expose method-of-victory or
// finishing round. So this pass only settles winner-based markets; method /
// round / total_rounds / distance / handicap bets stay open for admin to
// finalise via the existing Settle button.
// ---------------------------------------------------------------------------
export type UfcAutoSettleResult = {
  ok: boolean;
  checked: number;
  settledFights: number;
  settledBets: number;
  error?: string;
};

export async function runUfcAutoSettle(): Promise<UfcAutoSettleResult> {
  const nowIso = new Date().toISOString();
  const { data: fights, error } = await (supabaseAdmin as any)
    .from("ufc_fights")
    .select("id, apimma_fight_id, apimma_fighter_a_id, apimma_fighter_b_id, commence_time, status, winner")
    .eq("status", "scheduled")
    .is("winner", null)
    .not("apimma_fight_id", "is", null)
    .lt("commence_time", nowIso);
  if (error) return { ok: false, checked: 0, settledFights: 0, settledBets: 0, error: error.message };

  const rows = (fights ?? []) as Array<any>;
  if (rows.length === 0) return { ok: true, checked: 0, settledFights: 0, settledBets: 0 };

  // Batch feed lookups by UTC date. Try the actual commence date first, then
  // adjacent dates only if needed for timezone drift. This keeps settlement
  // from burning quota with three calls every cron tick.
  const primaryDates = new Set<string>();
  const fallbackDates = new Set<string>();
  for (const r of rows) {
    const t = new Date(r.commence_time as string);
    primaryDates.add(t.toISOString().slice(0, 10));
    for (let d = -1; d <= 1; d++) {
      const dt = new Date(t.getTime() + d * 24 * 60 * 60 * 1000);
      fallbackDates.add(dt.toISOString().slice(0, 10));
    }
  }
  const byId = new Map<number, ApiMmaFight>();
  const fetchDate = async (day: string) => {
    try {
      const list = await fetchFightsByDate(day);
      for (const f of list) byId.set(f.id, f);
    } catch (e) {
      console.warn("[ufc-auto-settle] fetch failed", day, (e as Error).message);
    }
  };
  for (const day of primaryDates) await fetchDate(day);
  const missingAfterPrimary = rows.some((r) => !byId.has(r.apimma_fight_id as number));
  if (missingAfterPrimary) {
    for (const day of fallbackDates) {
      if (primaryDates.has(day)) continue;
      await fetchDate(day);
      if (rows.every((r) => byId.has(r.apimma_fight_id as number))) break;
    }
  }

  let settledFights = 0;
  let settledBets = 0;
  for (const r of rows) {
    const feed = byId.get(r.apimma_fight_id as number);
    if (!feed) continue;
    if (feed.status.short !== "FT" && feed.status.short !== "AFT") continue;

    const firstId = feed.fighters.first.id;
    const secondId = feed.fighters.second.id;
    const aId = r.apimma_fighter_a_id as number | null;
    const bId = r.apimma_fighter_b_id as number | null;
    const aWon = aId === firstId ? feed.fighters.first.winner : aId === secondId ? feed.fighters.second.winner : null;
    const bWon = bId === firstId ? feed.fighters.first.winner : bId === secondId ? feed.fighters.second.winner : null;

    let winner: "a" | "b" | "draw" | null = null;
    if (aWon === true) winner = "a";
    else if (bWon === true) winner = "b";
    else if (aWon === false && bWon === false) winner = "draw";
    if (!winner) continue;

    try {
      const { data: n, error: rpcErr } = await (supabaseAdmin as any).rpc("auto_settle_ufc_winner_atomic", {
        p_fight_id: r.id,
        p_winner: winner,
      });
      if (rpcErr) {
        console.error("[ufc-auto-settle] rpc error", r.id, rpcErr.message);
        continue;
      }
      settledFights += 1;
      settledBets += Number(n ?? 0);
    } catch (e) {
      console.error("[ufc-auto-settle] rpc threw", r.id, (e as Error).message);
    }
  }

  return { ok: true, checked: rows.length, settledFights, settledBets };
}

