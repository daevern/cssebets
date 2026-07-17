import { format } from "date-fns";
import type { FootballMatch } from "../types/football";

export function FootballMatchHeader({ match }: { match: FootballMatch }) {
  const kickoff = new Date(match.kickoffAt);
  const showScore = ["live", "halftime", "finished"].includes(match.status);

  return (
    <header className="rounded-2xl border border-[var(--color-surface-border)]/70 bg-[var(--surface)]/60 p-5">
      <div className="flex items-center justify-between text-[11px] text-[var(--ink-muted)] mb-4">
        <span className="uppercase tracking-wider font-semibold">
          {match.competitionName}
          {match.round ? ` · ${match.round}` : ""}
        </span>
        <span>
          {match.status === "live" && match.liveMinute != null
            ? <span className="text-[var(--neon)] font-bold">LIVE {match.liveMinute}'</span>
            : match.status === "halftime"
              ? <span className="text-orange-400 font-bold">HALF TIME</span>
              : match.status === "finished"
                ? <span>FULL TIME</span>
                : format(kickoff, "EEE MMM d · HH:mm")}
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <TeamBig name={match.home.name} logo={match.home.logo} />
        <div className="flex flex-col items-center gap-1">
          {showScore ? (
            <div className="text-3xl font-bold tabular-nums text-[var(--ink)]">
              {match.home.score ?? 0} <span className="text-[var(--ink-muted)]">-</span> {match.away.score ?? 0}
            </div>
          ) : (
            <div className="text-2xl font-bold text-[var(--ink-muted)]">vs</div>
          )}
          {match.venue ? <div className="text-[11px] text-[var(--ink-muted)] text-center">{match.venue}</div> : null}
        </div>
        <TeamBig name={match.away.name} logo={match.away.logo} align="right" />
      </div>
    </header>
  );
}

function TeamBig({ name, logo, align = "left" }: { name: string; logo: string | null; align?: "left" | "right" }) {
  return (
    <div className={`flex flex-col items-center gap-2 flex-1 ${align === "right" ? "" : ""}`}>
      {logo ? (
        <img src={logo} alt="" className="h-14 w-14 object-contain" />
      ) : (
        <div className="h-14 w-14 rounded-full bg-white/5" />
      )}
      <div className="text-sm font-semibold text-center text-[var(--ink)] line-clamp-2">{name}</div>
    </div>
  );
}
