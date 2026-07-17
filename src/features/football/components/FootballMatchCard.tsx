import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import type { FootballMatch } from "../types/football";

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  live: { label: "LIVE", cls: "bg-[var(--neon)]/20 text-[var(--neon)] animate-pulse" },
  halftime: { label: "HT", cls: "bg-orange-500/20 text-orange-400" },
  finished: { label: "FT", cls: "bg-white/10 text-[var(--ink-muted)]" },
  postponed: { label: "PPD", cls: "bg-yellow-500/20 text-yellow-300" },
  cancelled: { label: "CANC", cls: "bg-red-500/20 text-red-400" },
  abandoned: { label: "ABD", cls: "bg-red-500/20 text-red-400" },
};

export function FootballMatchCard({ match }: { match: FootballMatch }) {
  const kickoff = new Date(match.kickoffAt);
  const badge = STATUS_BADGE[match.status];
  const showScore = match.status === "live" || match.status === "halftime" || match.status === "finished";

  return (
    <Link
      to="/football/matches/$matchId"
      params={{ matchId: match.id }}
      className="block rounded-2xl border border-[var(--color-surface-border)]/70 bg-[var(--surface)]/60 p-4 hover:border-[var(--neon)]/40 transition-colors"
    >
      <div className="flex items-center justify-between text-[11px] text-[var(--ink-muted)] mb-3">
        <span className="uppercase tracking-wider font-semibold">
          {match.competitionName}
          {match.round ? ` · ${match.round}` : ""}
        </span>
        <span className="flex items-center gap-2">
          {badge ? (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>
              {badge.label}
              {match.status === "live" && match.liveMinute != null ? ` ${match.liveMinute}'` : ""}
            </span>
          ) : (
            <span>{format(kickoff, "MMM d · HH:mm")}</span>
          )}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <TeamRow name={match.home.name} logo={match.home.logo} score={showScore ? match.home.score : null} />
        <div className="text-[var(--ink-muted)] text-xs">vs</div>
        <TeamRow name={match.away.name} logo={match.away.logo} score={showScore ? match.away.score : null} align="right" />
      </div>

      {match.venue ? (
        <div className="mt-3 text-[11px] text-[var(--ink-muted)] truncate">{match.venue}</div>
      ) : null}
    </Link>
  );
}

function TeamRow({
  name,
  logo,
  score,
  align = "left",
}: {
  name: string;
  logo: string | null;
  score: number | null;
  align?: "left" | "right";
}) {
  return (
    <div className={`flex flex-1 items-center gap-2 ${align === "right" ? "justify-end" : ""}`}>
      {align === "left" && logo ? <img src={logo} alt="" className="h-6 w-6 object-contain" /> : null}
      <span className="text-sm font-medium text-[var(--ink)] truncate">{name}</span>
      {score != null ? <span className="text-lg font-bold tabular-nums text-[var(--ink)]">{score}</span> : null}
      {align === "right" && logo ? <img src={logo} alt="" className="h-6 w-6 object-contain" /> : null}
    </div>
  );
}
