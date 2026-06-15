import { createServerFn } from "@tanstack/react-start";

export type LandingMatch = {
  id: string;
  home_team: string;
  away_team: string;
  home_crest: string | null;
  away_crest: string | null;
  kickoff_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  stage: string | null;
  reference_odds: { home: number; draw: number; away: number } | null;
};

export type LandingWinner = {
  display_name: string;
  points: number;
};

export type LandingData = {
  liveMatches: LandingMatch[];
  upcomingMatches: LandingMatch[];
  recentResults: LandingMatch[];
  stats: {
    totalMatches: number;
    totalBets: number;
    totalPlayers: number;
    totalPayouts: number;
  };
  topWinners: LandingWinner[];
};

export const getLandingData = createServerFn({ method: "GET" }).handler(
  async (): Promise<LandingData> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb: any = supabaseAdmin;

    const baseCols =
      "id, home_team, away_team, home_crest, away_crest, kickoff_at, status, home_score, away_score, stage, reference_odds";

    const [liveQ, upcomingQ, recentQ, matchCountQ, betCountQ, playerCountQ, payoutsQ] =
      await Promise.all([
        sb.from("matches").select(baseCols).eq("is_simulation", false).eq("status", "live").order("kickoff_at", { ascending: true }).limit(6),
        sb.from("matches").select(baseCols).eq("is_simulation", false).eq("status", "scheduled").gt("kickoff_at", new Date().toISOString()).order("kickoff_at", { ascending: true }).limit(8),
        sb.from("matches").select(baseCols).eq("is_simulation", false).eq("status", "finished").order("kickoff_at", { ascending: false }).limit(4),
        sb.from("matches").select("id", { count: "exact", head: true }).eq("is_simulation", false),
        sb.from("predictions").select("id", { count: "exact", head: true }).eq("is_simulation", false),
        sb.from("profiles").select("id", { count: "exact", head: true }),
        sb.from("platform_bankroll").select("total_payouts_paid").eq("id", 1).maybeSingle(),
      ]);

    // Top winners — sum settled winnings by user
    let topWinners: LandingWinner[] = [];
    try {
      const { data: preds } = await sb
        .from("predictions")
        .select("user_id, payout, status")
        .eq("is_simulation", false)
        .eq("status", "won")
        .limit(2000);
      const totals = new Map<string, number>();
      for (const p of (preds ?? []) as any[]) {
        const u = String(p.user_id);
        totals.set(u, (totals.get(u) ?? 0) + Number(p.payout ?? 0));
      }
      const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (top.length) {
        const ids = top.map(([id]) => id);
        const { data: profs } = await sb.from("profiles").select("id, display_name").in("id", ids);
        const nameMap = new Map<string, string>();
        for (const p of (profs ?? []) as any[]) nameMap.set(String(p.id), String(p.display_name ?? "Player"));
        topWinners = top.map(([id, pts]) => ({
          display_name: maskName(nameMap.get(id) ?? "Player"),
          points: pts,
        }));
      }
    } catch {
      topWinners = [];
    }

    return {
      liveMatches: (liveQ.data ?? []) as LandingMatch[],
      upcomingMatches: (upcomingQ.data ?? []) as LandingMatch[],
      recentResults: (recentQ.data ?? []) as LandingMatch[],
      stats: {
        totalMatches: matchCountQ.count ?? 0,
        totalBets: betCountQ.count ?? 0,
        totalPlayers: playerCountQ.count ?? 0,
        totalPayouts: Number(payoutsQ.data?.total_payouts_paid ?? 0),
      },
      topWinners,
    };
  },
);

function maskName(name: string): string {
  const n = name.trim();
  if (n.length <= 2) return n[0] + "*";
  return n[0] + "*".repeat(Math.min(4, n.length - 2)) + n[n.length - 1];
}
