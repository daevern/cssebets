// Odds freshness / market suspension helper.
// Suspends `open` football markets when their odds are older than
// stale_after_seconds OR when the parent event is no longer bettable.
// Called from the odds/live cron hooks — see routes/api/public/hooks/*.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SuspensionResult = {
  suspended: number;
  reasons: Record<string, number>;
};

export async function suspendStaleFootballMarkets(): Promise<SuspensionResult> {
  const nowIso = new Date().toISOString();
  const reasons: Record<string, number> = {};
  let total = 0;

  // 1) Suspend markets on events that are no longer takeable.
  const badStatuses = ["finished", "postponed", "cancelled", "abandoned"];
  const { data: badEvents } = await supabaseAdmin
    .from("sports_events" as any)
    .select("id, status")
    .eq("sport_code", "football")
    .in("status", badStatuses);

  for (const ev of (badEvents ?? []) as any[]) {
    const reason = `event ${ev.status}`;
    const { data: updated } = await supabaseAdmin
      .from("sports_markets" as any)
      .update({ status: "suspended", suspension_reason: reason, updated_at: nowIso })
      .eq("sports_event_id", ev.id)
      .eq("status", "open")
      .select("id");
    const n = (updated as any[] | null)?.length ?? 0;
    if (n) {
      total += n;
      reasons[reason] = (reasons[reason] ?? 0) + n;
    }
  }

  // 2) Suspend markets whose odds are older than their per-market threshold.
  // IMPORTANT: staleness only matters close to kickoff (or in-play). Far-off
  // fixtures are refreshed on a slow rotation by the odds batch, so applying
  // the same short threshold to them suspends healthy pre-match markets.
  const NEAR_KICKOFF_MS = 12 * 3600_000;
  const now = Date.now();

  const { data: soonEvents } = await supabaseAdmin
    .from("sports_events" as any)
    .select("id, scheduled_at, status")
    .eq("sport_code", "football")
    .in("status", ["scheduled", "live"])
    .lt("scheduled_at", new Date(now + NEAR_KICKOFF_MS).toISOString());

  const soonIds = ((soonEvents ?? []) as any[]).map((e) => e.id);

  const staleIds: string[] = [];
  if (soonIds.length) {
    const { data: openMarkets } = await supabaseAdmin
      .from("sports_markets" as any)
      .select("id, last_odds_update_at, stale_after_seconds")
      .eq("status", "open")
      .in("sports_event_id", soonIds)
      .not("last_odds_update_at", "is", null);

    for (const m of (openMarkets ?? []) as any[]) {
      const ts = new Date(m.last_odds_update_at).getTime();
      const maxAgeMs = Number(m.stale_after_seconds ?? 10800) * 1000;
      if (Number.isFinite(ts) && now - ts > maxAgeMs) staleIds.push(m.id);
    }
  }

  if (staleIds.length) {
    const reason = "odds stale";
    const { data: updated } = await supabaseAdmin
      .from("sports_markets" as any)
      .update({ status: "suspended", suspension_reason: reason, updated_at: nowIso })
      .in("id", staleIds)
      .select("id");
    const n = (updated as any[] | null)?.length ?? 0;
    if (n) {
      total += n;
      reasons[reason] = (reasons[reason] ?? 0) + n;
    }
  }

  return { suspended: total, reasons };
}

// Called from odds sync AFTER upserting fresh selections, to un-suspend
// markets that came back into freshness range and to stamp freshness metadata.
export async function markMarketFresh(
  marketId: string,
  providerOddsTs: string,
  now: string = new Date().toISOString(),
) {
  await supabaseAdmin
    .from("sports_markets" as any)
    .update({
      provider_odds_ts: providerOddsTs,
      last_odds_update_at: now,
      // Only un-suspend markets we previously suspended for staleness — don't
      // reopen event-ended markets.
      status: "open",
      suspension_reason: null,
      updated_at: now,
    })
    .eq("id", marketId)
    .in("status", ["open", "suspended"]) // never touch settled/void
    .neq("status", "settled");
}
