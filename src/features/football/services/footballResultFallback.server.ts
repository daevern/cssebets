// Fallback result ingestion.
//
// Primary results come from API-Football. When that feed is unavailable
// (plan downgrade, daily quota exhausted, provider outage) finished fixtures
// never get their scores, so bets stay pending forever. This module fills the
// gap using football-data.org, which we already hold a key for.
//
// It ONLY writes final scores + status for fixtures whose kickoff has passed.
// Odds/markets are untouched.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FD_COMPETITION: Record<string, string> = {
  EPL: "PL",
  LA_LIGA: "PD",
  SERIE_A: "SA",
  BUNDESLIGA: "BL1",
  LIGUE_1: "FL1",
  CHAMPIONS_LEAGUE: "CL",
};

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(fc|afc|cf|sc|ac|club|calcio|united|city)\b/g, (m) => m)
    .replace(/[^a-z0-9]/g, "");
}

function teamMatches(ours: string, provider: { name?: string; shortName?: string; tla?: string }) {
  const a = norm(ours);
  const candidates = [provider.name, provider.shortName, provider.tla]
    .filter(Boolean)
    .map((c) => norm(String(c)));
  return candidates.some((c) => c && (c === a || c.includes(a) || a.includes(c)));
}

type FdMatch = {
  utcDate: string;
  status: string;
  homeTeam: { name?: string; shortName?: string; tla?: string };
  awayTeam: { name?: string; shortName?: string; tla?: string };
  score: {
    fullTime: { home: number | null; away: number | null };
    halfTime?: { home: number | null; away: number | null };
    regularTime?: { home: number | null; away: number | null };
    duration?: string;
  };
};

export async function backfillFinishedFootballResults(opts: { lookbackDays?: number } = {}) {
  const key = process.env["FOOTBALL_DATA_API_KEY"]?.trim();
  if (!key) return { checked: 0, updated: 0, reason: "FOOTBALL_DATA_API_KEY not set" };

  const lookbackDays = opts.lookbackDays ?? 5;
  const since = new Date(Date.now() - lookbackDays * 86400_000);
  // Only fixtures that kicked off at least 2h ago and still aren't finished.
  const until = new Date(Date.now() - 2 * 3600_000);

  const { data: pending } = await supabaseAdmin
    .from("sports_events" as any)
    .select("id, competition_code, home_name, away_name, scheduled_at, status")
    .eq("sport_code", "football")
    .in("status", ["scheduled", "live"])
    .gte("scheduled_at", since.toISOString())
    .lte("scheduled_at", until.toISOString())
    .limit(100);

  const rows = (pending ?? []) as any[];
  if (rows.length === 0) return { checked: 0, updated: 0 };

  const byCompetition = new Map<string, any[]>();
  for (const r of rows) {
    const fd = FD_COMPETITION[r.competition_code];
    if (!fd) continue;
    const list = byCompetition.get(fd) ?? [];
    list.push(r);
    byCompetition.set(fd, list);
  }

  const dateFrom = since.toISOString().slice(0, 10);
  const dateTo = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

  let updated = 0;
  const errors: string[] = [];

  for (const [fdCode, events] of byCompetition) {
    let matches: FdMatch[] = [];
    try {
      const res = await fetch(
        `https://api.football-data.org/v4/competitions/${fdCode}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,
        { headers: { "X-Auth-Token": key } },
      );
      if (!res.ok) {
        errors.push(`${fdCode}: HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { matches?: FdMatch[] };
      matches = json.matches ?? [];
    } catch (e: any) {
      errors.push(`${fdCode}: ${e?.message ?? String(e)}`);
      continue;
    }

    for (const ev of events) {
      const kickoff = new Date(ev.scheduled_at).getTime();
      const candidate = matches.find((m) => {
        if (m.status !== "FINISHED") return false;
        if (Math.abs(new Date(m.utcDate).getTime() - kickoff) > 36 * 3600_000) return false;
        return teamMatches(ev.home_name, m.homeTeam) && teamMatches(ev.away_name, m.awayTeam);
      });
      if (!candidate) continue;

      // 90-minute markets grade on regulation time.
      const reg = candidate.score.regularTime;
      const ft = candidate.score.fullTime;
      const home = reg?.home ?? ft?.home ?? null;
      const away = reg?.away ?? ft?.away ?? null;
      if (home == null || away == null) continue;

      const { error } = await supabaseAdmin
        .from("sports_events" as any)
        .update({
          status: "finished",
          home_score: home,
          away_score: away,
          ht_home_score: candidate.score.halfTime?.home ?? null,
          ht_away_score: candidate.score.halfTime?.away ?? null,
          markets_open: false,
        })
        .eq("id", ev.id);
      if (error) {
        errors.push(`${ev.id}: ${error.message}`);
        continue;
      }
      updated++;
    }
  }

  return { checked: rows.length, updated, errors: errors.length ? errors.slice(0, 10) : undefined };
}
