import { format } from "date-fns";
import { competitionLogoForCode } from "../config/footballCompetitions";
import type { FootballMatch } from "../types/football";

export function FootballMatchHeader({ match }: { match: FootballMatch }) {
  const kickoff = new Date(match.kickoffAt);
  const showScore = ["live", "halftime", "finished"].includes(match.status);
  const leagueLogo = competitionLogoForCode(match.competitionCode);
  const live = match.status === "live" || match.status === "halftime";

  return (
    <header className="relative overflow-hidden rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-5">
      {live && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(100% 60% at 50% 0%, rgba(244,63,94,0.10), transparent 60%)",
          }}
        />
      )}
      <div className="relative mb-4 flex items-center justify-between gap-3 text-[11px] font-semibold">
        <span className="flex min-w-0 items-center gap-2 text-[var(--ink-muted)]">
          {leagueLogo && (
            <img src={leagueLogo} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />
          )}
          <span className="truncate uppercase tracking-wider">
            {match.competitionName}
            {match.round ? ` · ${match.round}` : ""}
          </span>
        </span>
        <span className="shrink-0">
          {match.status === "live" ? (
            <span className="flex items-center gap-1.5 text-rose-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
              </span>
              LIVE{match.liveMinute != null ? ` ${match.liveMinute}'` : ""}
            </span>
          ) : match.status === "halftime" ? (
            <span className="text-orange-400">HALF TIME</span>
          ) : match.status === "finished" ? (
            <span className="text-[var(--ink-muted)]">FULL TIME</span>
          ) : (
            <span className="text-[var(--ink-muted)]">{format(kickoff, "EEE MMM d · HH:mm")}</span>
          )}
        </span>
      </div>

      <div className="relative flex items-center justify-between gap-4">
        <TeamBig name={match.home.name} logo={match.home.logo} />
        <div className="flex shrink-0 flex-col items-center gap-1">
          {showScore ? (
            <div className="font-display text-3xl font-bold tabular-nums text-[var(--ink)]">
              {match.home.score ?? 0} <span className="text-[var(--ink-muted)]">-</span> {match.away.score ?? 0}
            </div>
          ) : (
            <div className="font-display text-2xl font-bold text-[var(--ink-muted)]">vs</div>
          )}
          {match.venue ? (
            <div className="max-w-[9rem] truncate text-center text-[11px] text-[var(--ink-muted)]">{match.venue}</div>
          ) : null}
        </div>
        <TeamBig name={match.away.name} logo={match.away.logo} />
      </div>
    </header>
  );
}

function TeamBig({ name, logo }: { name: string; logo: string | null }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      {logo ? (
        <img src={logo} alt="" className="h-14 w-14 object-contain" loading="lazy" />
      ) : (
        <div className="h-14 w-14 rounded-full bg-[var(--surface-3)]" />
      )}
      <div className="line-clamp-2 text-center text-sm font-bold tracking-tight text-[var(--ink)]">{name}</div>
    </div>
  );
}
