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
  pickBookmaker,
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
  const bm = pickBookmaker(odds.bookmakers);
  if (!bm) return 0;

  const nowIso = new Date().toISOString();
  const upserts: any[] = [];
  const snapshots: any[] = [];

  const fA = normalizeFighterName(fightRow.fighter_a);
  const fB = normalizeFighterName(fightRow.fighter_b);
  const side = (name: string): "a" | "b" | null => {
    const n = normalizeFighterName(name);
    if (n === fA || fA.includes(n) || n.includes(fA)) return "a";
    if (n === fB || fB.includes(n) || n.includes(fB)) return "b";
    return null;
  };

  // ---- Moneyline (bet 2 "Home/Away" or bet 1 "3Way Result") ----
  const mlBet = bm.bets.find((b) => b.id === 2) ?? bm.bets.find((b) => b.id === 1);
  if (mlBet) {
    const aVals: number[] = [];
    const bVals: number[] = [];
    for (const v of mlBet.values) {
      const val = v.value.toLowerCase();
      const price = Number(v.odd);
      if (!Number.isFinite(price)) continue;
      if (val === "home" || val === "1") aVals.push(price);
      else if (val === "away" || val === "2") bVals.push(price);
      // "Draw" (3-way) is ignored — we only support 2-way moneyline
    }
    if (aVals.length && bVals.length) {
      const priced = await apply2WayMargin(median(aVals), median(bVals));
      upserts.push(
        { fight_id: fightRow.id, market_type: "moneyline", selection_key: "a", label: fightRow.fighter_a, odds: priced.a, is_active: true, updated_at: nowIso },
        { fight_id: fightRow.id, market_type: "moneyline", selection_key: "b", label: fightRow.fighter_b, odds: priced.b, is_active: true, updated_at: nowIso },
      );
      snapshots.push(
        { fight_id: fightRow.id, market_type: "moneyline", selection_key: "a", odds: priced.a },
        { fight_id: fightRow.id, market_type: "moneyline", selection_key: "b", odds: priced.b },
      );
    }
  }

  // ---- Method of Victory (per fighter) ----
  // API-Sports bets 17-20 give home/away Sub, home/away KO/TKO. Bet 11+12 =
  // decision (unanimous, split/majority — combined into "decision").
  const methodPrices: Record<string, number[]> = {
    a_ko_tko: [], a_submission: [], a_decision: [],
    b_ko_tko: [], b_submission: [], b_decision: [],
  };
  const captureMethod = (betId: number, slot: "a" | "b", method: "ko_tko" | "submission" | "decision") => {
    const bet = bm.bets.find((b) => b.id === betId);
    if (!bet) return;
    for (const v of bet.values) {
      const p = Number(v.odd);
      if (Number.isFinite(p)) methodPrices[`${slot}_${method}`].push(p);
    }
  };
  captureMethod(17, "a", "submission");
  captureMethod(18, "a", "ko_tko");
  captureMethod(19, "b", "submission");
  captureMethod(20, "b", "ko_tko");
  // Decision splits: bets 13 (home unanimous) + 14 (home split); 15+16 for away.
  // Combine both into one implied decision price per fighter.
  const combineDec = (unanimousId: number, splitId: number, slot: "a" | "b") => {
    const u = bm.bets.find((b) => b.id === unanimousId);
    const s = bm.bets.find((b) => b.id === splitId);
    if (!u && !s) return;
    // implied prob = 1/odds; sum probabilities of unanimous + split
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

  // ---- Round Betting (bet 6) — collapse per-fighter into overall round ----
  const roundBet = bm.bets.find((b) => b.id === 6);
  if (roundBet) {
    const roundPrices: Record<string, number[]> = {};
    for (const v of roundBet.values) {
      // Values look like "1st Round", "2nd Round", ..., "Goes the distance"
      const val = v.value.toLowerCase();
      const price = Number(v.odd);
      if (!Number.isFinite(price)) continue;
      let key: string | null = null;
      if (/distance|decision/.test(val)) key = "distance";
      else {
        const m = val.match(/(\d+)/);
        if (m) key = `r${m[1]}`;
      }
      if (!key) continue;
      if (!roundPrices[key]) roundPrices[key] = [];
      roundPrices[key].push(price);
    }
    const roundEntries = Object.entries(roundPrices).map(([k, arr]) => ({ team: k, odds: median(arr) }));
    if (roundEntries.length >= 2) {
      const priced = await applyOutrightMargin(roundEntries);
      for (const p of priced) {
        const label = p.team === "distance" ? "Goes the distance" : `Round ${p.team.slice(1)}`;
        upserts.push({ fight_id: fightRow.id, market_type: "round", selection_key: p.team, label, odds: p.odds, is_active: true, updated_at: nowIso });
        snapshots.push({ fight_id: fightRow.id, market_type: "round", selection_key: p.team, odds: p.odds });
      }
    }
  }

  if (!upserts.length) return 0;
  const { error: mErr } = await (supabaseAdmin as any)
    .from("ufc_fight_markets")
    .upsert(upserts, { onConflict: "fight_id,market_type,selection_key" });
  if (mErr) throw new Error(`market save failed: ${mErr.message}`);

  // De-dupe snapshots: skip if identical to last snapshot for the same key.
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

// ---- H2H ----
async function syncH2H(fightRowId: string, aId: number, bId: number) {
  try {
    const records = await fetchFighterRecords(aId);
    if (!records?.length) return;
    const rows: any[] = [];
    for (const r of records) {
      const opp = r.fighters.first.id === aId ? r.fighters.second : r.fighters.first;
      if (opp.id !== bId) continue;
      const aSlotWinner = r.fighters.first.id === aId
        ? (r.fighters.first.winner ? "a" : r.fighters.second.winner ? "b" : "draw")
        : (r.fighters.second.winner ? "a" : r.fighters.first.winner ? "b" : "draw");
      rows.push({
        fight_id: fightRowId,
        past_fight_apimma_id: r.id,
        date: r.date.slice(0, 10),
        event_name: r.slug ?? null,
        winner_slot: aSlotWinner,
        method: null,
        round: null,
      });
    }
    if (rows.length) {
      await (supabaseAdmin as any)
        .from("ufc_fight_h2h")
        .upsert(rows, { onConflict: "fight_id,past_fight_apimma_id" });
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
