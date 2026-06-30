// Server function exposed to the client: returns a full analytics bundle
// for a single match. Reads from cached tables; triggers an on-demand
// refresh only when cached data is stale and the match is in a phase where
// new data could be available.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LineupPlayer = {
  id: number | null;
  name: string;
  number: number | null;
  pos: string | null;
  grid: string | null;
};

export type AnalyticsBundle = {
  match: {
    id: string;
    home_team: string;
    away_team: string;
    kickoff_at: string;
    status: string;
    stage: string | null;
    group_name: string | null;
    home_score: number | null;
    away_score: number | null;
    venue: string | null;
    referee: string | null;
    apifootball_fixture_id: number | null;
  } | null;
  phase: "pre" | "lineups" | "live" | "finished";
  lineups: {
    home: any | null;
    away: any | null;
  };
  events: any[];
  stats: { home: any | null; away: any | null };
  ratings: { home: any[]; away: any[] };
  h2h: any[];
  injuries: { home: any[]; away: any[] };
  teamForm: { home: any | null; away: any | null };
};

export const getMatchAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { matchId: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const matchId = data.matchId;

    const { data: mRaw } = await (supabaseAdmin as any)
      .from("matches")
      .select(
        "id, home_team, away_team, kickoff_at, status, stage, group_name, home_score, away_score, apifootball_fixture_id",
      )
      .eq("id", matchId)
      .maybeSingle();
    const m = mRaw ? { ...mRaw, venue: null, referee: null } : null;
    if (!m) {
      return {
        match: null,
        phase: "pre",
        lineups: { home: null, away: null },
        events: [],
        stats: { home: null, away: null },
        ratings: { home: [], away: [] },
        h2h: [],
        injuries: { home: [], away: [] },
        teamForm: { home: null, away: null },
      } as AnalyticsBundle;
    }

    const now = Date.now();
    const kickoff = new Date(m.kickoff_at).getTime();
    let phase: AnalyticsBundle["phase"] = "pre";
    if (m.status === "finished") phase = "finished";
    else if (now >= kickoff) phase = "live";
    else if (kickoff - now <= 90 * 60 * 1000) phase = "lineups";

    // Pull cached rows in parallel
    const [lineupsR, eventsR, statsR, ratingsR, injR, h2hR] = await Promise.all([
      (supabaseAdmin as any).from("match_lineups").select("*").eq("match_id", matchId),
      (supabaseAdmin as any)
        .from("match_events")
        .select("*")
        .eq("match_id", matchId)
        .order("minute", { ascending: true }),
      (supabaseAdmin as any).from("match_stats").select("*").eq("match_id", matchId),
      (supabaseAdmin as any)
        .from("match_player_ratings")
        .select("*")
        .eq("match_id", matchId)
        .order("rating", { ascending: false }),
      (supabaseAdmin as any).from("match_injuries").select("*").eq("match_id", matchId),
      (async () => {
        const norm = (s: string) =>
          (s || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]/g, "");
        const na = norm(m.home_team);
        const nb = norm(m.away_team);
        const key = na < nb ? `${na}__${nb}` : `${nb}__${na}`;
        return (supabaseAdmin as any).from("match_h2h").select("*").eq("pair_key", key).maybeSingle();
      })(),
    ]);

    const homeLineup = (lineupsR.data ?? []).find((r: any) => r.side === "home") ?? null;
    const awayLineup = (lineupsR.data ?? []).find((r: any) => r.side === "away") ?? null;
    const homeStats = (statsR.data ?? []).find((r: any) => r.side === "home") ?? null;
    const awayStats = (statsR.data ?? []).find((r: any) => r.side === "away") ?? null;
    const homeRatings = (ratingsR.data ?? []).filter((r: any) => r.side === "home");
    const awayRatings = (ratingsR.data ?? []).filter((r: any) => r.side === "away");
    const homeInj = (injR.data ?? []).filter((r: any) => r.side === "home");
    const awayInj = (injR.data ?? []).filter((r: any) => r.side === "away");

    // On-demand refresh — gated to phase and cache freshness, never blocking response.
    // We fire-and-forget so the UI returns immediately with whatever is cached.
    const triggerSync = async () => {
      try {
        const mod = await import("@/lib/apifootball-analytics.server");
        const isStale = (iso: string | null, maxMin: number) =>
          !iso || Date.now() - new Date(iso).getTime() > maxMin * 60 * 1000;
        const lineupAge = lineupsR.data?.[0]?.fetched_at ?? null;
        const statsAge = statsR.data?.[0]?.fetched_at ?? null;
        const ratingsAge = ratingsR.data?.[0]?.fetched_at ?? null;
        const h2hAge = h2hR.data?.fetched_at ?? null;
        const injAge = injR.data?.[0]?.fetched_at ?? null;

        if (phase === "pre" || phase === "lineups") {
          if (isStale(h2hAge, 24 * 60)) await mod.syncH2H(matchId);
          if (phase === "lineups" && isStale(lineupAge, 5)) await mod.syncLineups(matchId);
          if (isStale(injAge, 12 * 60)) await mod.syncInjuries(matchId);
        } else if (phase === "live") {
          if (isStale(lineupAge, 60)) await mod.syncLineups(matchId);
          await mod.syncEvents(matchId);
          if (isStale(statsAge, 2)) await mod.syncStats(matchId);
        } else if (phase === "finished") {
          if (isStale(ratingsAge, 60 * 24)) {
            await mod.syncPlayerRatings(matchId);
            await mod.syncStats(matchId);
            await mod.syncEvents(matchId);
          }
        }
      } catch {
        // Quota / network failures must not break the page.
      }
    };
    // Block briefly so first paint has fresh data, but cap so UI stays snappy.
    await Promise.race([triggerSync(), new Promise((r) => setTimeout(r, 2500))]);

    // Re-read after potential refresh
    const [l2, e2, s2, r2, i2] = await Promise.all([
      (supabaseAdmin as any).from("match_lineups").select("*").eq("match_id", matchId),
      (supabaseAdmin as any)
        .from("match_events")
        .select("*")
        .eq("match_id", matchId)
        .order("minute", { ascending: true }),
      (supabaseAdmin as any).from("match_stats").select("*").eq("match_id", matchId),
      (supabaseAdmin as any)
        .from("match_player_ratings")
        .select("*")
        .eq("match_id", matchId)
        .order("rating", { ascending: false }),
      (supabaseAdmin as any).from("match_injuries").select("*").eq("match_id", matchId),
    ]);

    return {
      match: m,
      phase,
      lineups: {
        home: (l2.data ?? []).find((r: any) => r.side === "home") ?? homeLineup,
        away: (l2.data ?? []).find((r: any) => r.side === "away") ?? awayLineup,
      },
      events: e2.data ?? eventsR.data ?? [],
      stats: {
        home: (s2.data ?? []).find((r: any) => r.side === "home") ?? homeStats,
        away: (s2.data ?? []).find((r: any) => r.side === "away") ?? awayStats,
      },
      ratings: {
        home: (r2.data ?? []).filter((r: any) => r.side === "home") ?? homeRatings,
        away: (r2.data ?? []).filter((r: any) => r.side === "away") ?? awayRatings,
      },
      h2h: (h2hR.data as any)?.fixtures ?? [],
      injuries: { home: homeInj, away: awayInj },
      teamForm: { home: null, away: null },
    } as AnalyticsBundle;
  });
