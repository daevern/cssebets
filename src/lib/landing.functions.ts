import { createServerFn } from "@tanstack/react-start";

export type LandingNextMatch = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  homeOdds: number | null;
  drawOdds: number | null;
  awayOdds: number | null;
} | null;

export type LandingStats = {
  registeredPlayers: number;
  activeToday: number;
  betsSettled: number;
  pointsPaidOut: number;
};

export const getLandingData = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ nextMatches: LandingNextMatch[]; stats: LandingStats }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [nextMatchesRes, profilesRes, activeRes, settledRes, paidRes] = await Promise.all([
      supabaseAdmin
        .from("matches")
        .select("id, home_team, away_team, kickoff_at, reference_odds, status")
        .gte("kickoff_at", nowIso)
        .in("status", ["scheduled"])
        .order("kickoff_at", { ascending: true })
        .limit(12),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("predictions").select("user_id").gte("created_at", dayAgo),
      supabaseAdmin.from("predictions").select("id", { count: "exact", head: true }).neq("status", "pending"),
      supabaseAdmin.from("predictions").select("points").eq("status", "won"),
    ]);

    const matchesList = nextMatchesRes.data || [];
    const nextMatches: LandingNextMatch[] = matchesList.map((m) => {
      const refOdds: any = (m as any)?.reference_odds ?? {};
      return {
        id: m.id,
        homeTeam: m.home_team,
        awayTeam: m.away_team,
        kickoffAt: m.kickoff_at,
        homeOdds: refOdds.home != null ? Number(refOdds.home) : null,
        drawOdds: refOdds.draw != null ? Number(refOdds.draw) : null,
        awayOdds: refOdds.away != null ? Number(refOdds.away) : null,
      };
    });

    const activeToday = new Set((activeRes.data ?? []).map((r: any) => r.user_id)).size;
    const pointsPaidOut = (paidRes.data ?? []).reduce(
      (s: number, r: any) => s + Number(r.points || 0),
      0,
    );

    return {
      nextMatches,
      stats: {
        registeredPlayers: profilesRes.count ?? 0,
        activeToday,
        betsSettled: settledRes.count ?? 0,
        pointsPaidOut,
      },
    };
  },
);
