// Server-only: apply a target house margin (overround) to a set of decimal odds.
// Reduces each odd proportionally so the implied-probability sum becomes (1 + marginPct/100).
// If existing overround already meets/exceeds the target, returns odds unchanged.

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
    marginPct: Number((data as any)?.margin_pct ?? 6),
    apply: Boolean((data as any)?.apply_margin_to_real ?? true),
  };
  _cache = { value, expiresAt: Date.now() + 60_000 }; // 1 min cache
  return value;
}

function shrinkFactor(currentOverround: number, targetOverround: number): number {
  // new_odds = old_odds * currentOverround / targetOverround
  if (currentOverround <= 0) return 1;
  if (currentOverround >= targetOverround) return 1; // already enough margin
  return currentOverround / targetOverround;
}

export async function apply3WayMargin(odds: { home: number; draw: number; away: number }) {
  const { marginPct, apply } = await getRealOddsMarginSettings();
  if (!apply) return odds;
  const target = 1 + marginPct / 100;
  const cur = 1 / odds.home + 1 / odds.draw + 1 / odds.away;
  const k = shrinkFactor(cur, target);
  if (k === 1) return odds;
  const adjusted = {
    home: Number((odds.home * k).toFixed(2)),
    draw: Number((odds.draw * k).toFixed(2)),
    away: Number((odds.away * k).toFixed(2)),
  };
  if (adjusted.home < 1.01 || adjusted.draw < 1.01 || adjusted.away < 1.01) {
    return odds;
  }
  return {
    home: adjusted.home,
    draw: adjusted.draw,
    away: adjusted.away,
  };
}

// For outright (N-way) markets, apply the same factor across all teams using
// the field's combined implied-probability sum.
export async function applyOutrightMargin(odds: Array<{ team: string; odds: number }>) {
  const { marginPct, apply } = await getRealOddsMarginSettings();
  if (!apply || odds.length === 0) return odds;
  const target = 1 + marginPct / 100;
  const cur = odds.reduce((s, o) => s + 1 / o.odds, 0);
  const k = shrinkFactor(cur, target);
  if (k === 1) return odds;
  return odds.map((o) => ({ team: o.team, odds: Number((o.odds * k).toFixed(2)) }));
}
