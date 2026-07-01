// Server-only: CSSEBets house pricing model.
//
// CSSEBets does NOT copy bookmaker odds. We take API odds as a reference,
// strip the bookmaker overround to get fair probabilities, then apply the
// CSSEBets house margin and convert back to decimal odds.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

let _cache: { value: { marginPct: number; apply: boolean }; expiresAt: number } | null = null;

export async function getRealOddsMarginSettings(): Promise<{ marginPct: number; apply: boolean }> {
  if (_cache && _cache.expiresAt > Date.now()) return _cache.value;
  const { data } = await supabaseAdmin
    .from("platform_settings" as any)
    .select("margin_pct, apply_margin_to_real")
    .eq("id", 1)
    .maybeSingle();
  const value = {
    marginPct: Number((data as any)?.margin_pct ?? 25),
    apply: Boolean((data as any)?.apply_margin_to_real ?? true),
  };
  _cache = { value, expiresAt: Date.now() + 60_000 };
  return value;
}

const MIN_ODD = 1.01;
const MAX_ODD = 1000;
const round2 = (x: number) => Math.round(x * 100) / 100;
const clamp = (x: number) => Math.max(MIN_ODD, round2(x));

export function parseValidDecimalOdd(value: unknown, field = "odds"): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  if (value < MIN_ODD) throw new Error(`${field} must be at least ${MIN_ODD}`);
  if (value > MAX_ODD) throw new Error(`${field} exceeds maximum supported odd ${MAX_ODD}`);
  return value;
}

export function validateThreeWayOdds(odds: { home: unknown; draw: unknown; away: unknown }) {
  return {
    home: parseValidDecimalOdd(odds.home, "home"),
    draw: parseValidDecimalOdd(odds.draw, "draw"),
    away: parseValidDecimalOdd(odds.away, "away"),
  };
}

export type ThreeWayBreakdown = {
  api: { home: number; draw: number; away: number };
  fair: { home: number; draw: number; away: number };
  house: { home: number; draw: number; away: number };
  final: { home: number; draw: number; away: number };
  marginPct: number;
  floorApplied: { home: boolean; draw: boolean; away: boolean };
};

export async function compute3WayOdds(
  odds: { home: number; draw: number; away: number },
  opts?: { applyMargin?: boolean },
): Promise<ThreeWayBreakdown> {
  const settings = await getRealOddsMarginSettings();
  const marginPct = settings.marginPct;
  const apply = opts?.applyMargin ?? settings.apply;
  const api = validateThreeWayOdds(odds);
  const raw = { home: 1 / api.home, draw: 1 / api.draw, away: 1 / api.away };
  const sum = raw.home + raw.draw + raw.away;
  const fair = sum > 0
    ? { home: raw.home / sum, draw: raw.draw / sum, away: raw.away / sum }
    : { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  const mult = apply ? 1 + marginPct / 100 : 1;
  const house = {
    home: Math.min(0.999, fair.home * mult),
    draw: Math.min(0.999, fair.draw * mult),
    away: Math.min(0.999, fair.away * mult),
  };
  const rawFinal = {
    home: 1 / Math.max(house.home, 1e-6),
    draw: 1 / Math.max(house.draw, 1e-6),
    away: 1 / Math.max(house.away, 1e-6),
  };
  const final = {
    home: clamp(rawFinal.home),
    draw: clamp(rawFinal.draw),
    away: clamp(rawFinal.away),
  };
  return {
    api,
    fair,
    house,
    final,
    marginPct: apply ? marginPct : 0,
    floorApplied: {
      home: rawFinal.home < MIN_ODD,
      draw: rawFinal.draw < MIN_ODD,
      away: rawFinal.away < MIN_ODD,
    },
  };
}

export async function apply3WayMargin(
  odds: { home: number; draw: number; away: number },
  opts?: { applyMargin?: boolean },
) {
  const b = await compute3WayOdds(odds, opts);
  return b.final;
}

export async function applyOutrightMargin(odds: Array<{ team: string; odds: number }>) {
  const { marginPct, apply } = await getRealOddsMarginSettings();
  if (odds.length === 0) return odds;
  const api = odds.map((o) => ({ team: o.team, odds: parseValidDecimalOdd(o.odds, `odds:${o.team}`) }));
  const raw = api.map((o) => 1 / o.odds);
  const sum = raw.reduce((s, x) => s + x, 0);
  const fair = sum > 0 ? raw.map((x) => x / sum) : raw.map(() => 1 / raw.length);
  const mult = apply ? 1 + marginPct / 100 : 1;
  return api.map((o, i) => {
    const house = Math.min(0.999, fair[i] * mult);
    return { team: o.team, odds: clamp(1 / Math.max(house, 1e-6)) };
  });
}
