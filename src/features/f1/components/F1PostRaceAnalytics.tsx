import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Trophy, Zap, Flag } from "lucide-react";
import { getF1RaceAnalytics } from "../f1.functions";

export function F1PostRaceAnalytics({ raceId }: { raceId: string }) {
  const fn = useServerFn(getF1RaceAnalytics);
  const q = useQuery({
    queryKey: ["f1-race-analytics", raceId],
    queryFn: () => fn({ data: { raceId } }),
    staleTime: 60_000,
  });

  if (q.isLoading) {
    return (
      <div className="grid place-items-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--color-ink-muted)]" />
      </div>
    );
  }

  const classification: any[] = q.data?.classification ?? [];
  const podium: any[] = q.data?.podium ?? [];
  const fastestLap: any = q.data?.fastestLap ?? null;
  const constructorPoints: any[] = q.data?.constructorPoints ?? [];

  if (classification.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-surface-border)] bg-black/30 p-6 text-center text-sm text-[var(--color-ink-muted)]">
        Final Race Classification not yet available. Results appear once the FIA posts them.
      </div>
    );
  }

  const maxPts = constructorPoints[0]?.points ?? 1;
  const podiumTint = ["#FFD54A", "#C7CBD1", "#D08154"];

  return (
    <section className="space-y-6">
      {/* Header pill */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-neon)]/40 bg-[var(--color-neon)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-neon)]">
          <Flag className="h-3 w-3" /> Final Race Classification
        </span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">Official</span>
      </div>

      {/* Podium cards */}
      {podium.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {podium.map((r, i) => (
            <div
              key={i}
              className="relative flex flex-col items-center gap-1.5 overflow-hidden rounded-xl border border-[var(--color-surface-border)] bg-black/40 p-3"
              style={{ boxShadow: `inset 0 -3px 0 ${podiumTint[i]}` }}
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: podiumTint[i] }}>
                P{r.position}
              </div>
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-[var(--surface-3)] ring-1 ring-[var(--color-surface-border)]/60">
                {r.driver?.image ? (
                  <img src={r.driver.image} alt={r.driver?.name} className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="line-clamp-1 text-center text-[12px] font-semibold text-[var(--color-ink)]">
                {r.driver?.name}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-ink-muted)]">
                {r.team?.logo ? (
                  <img src={r.team.logo} alt={r.team.name} className="h-3.5 w-3.5 object-contain" />
                ) : null}
                <span className="line-clamp-1">{r.team?.name}</span>
              </div>
              <div className="mt-0.5 font-display text-[13px] font-bold tabular-nums text-[var(--color-ink)]">
                {r.time ?? "—"}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fastest lap */}
      {fastestLap && (
        <div className="flex items-center gap-3 rounded-xl border border-purple-500/40 bg-purple-500/10 p-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-purple-500/20">
            <Zap className="h-5 w-5 text-purple-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-purple-300">
              Fastest lap
            </div>
            <div className="truncate text-sm font-semibold text-[var(--color-ink)]">
              {fastestLap.driver?.name ?? "—"}
            </div>
          </div>
          <div className="font-display text-lg font-bold tabular-nums text-purple-200">
            {fastestLap.time ?? "—"}
          </div>
        </div>
      )}

      {/* Full classification */}
      <div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          Full classification
        </h3>
        <div className="overflow-hidden rounded-xl border border-[var(--color-surface-border)] bg-black/30">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[var(--color-surface-border)]/70 text-left text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                <th className="py-2 pl-3">Pos</th>
                <th>Driver</th>
                <th className="hidden sm:table-cell">Team</th>
                <th className="text-center">Grid</th>
                <th className="text-center">Laps</th>
                <th className="pr-3 text-right">Time / Gap</th>
              </tr>
            </thead>
            <tbody>
              {classification.map((r: any, i: number) => (
                <tr
                  key={i}
                  className="border-b border-[var(--color-surface-border)]/40 last:border-b-0 hover:bg-white/[0.02]"
                >
                  <td className="py-2 pl-3 font-display font-bold tabular-nums">
                    {r.position ?? "—"}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-[var(--surface-3)] ring-1 ring-[var(--color-surface-border)]/60">
                        {r.driver?.image ? (
                          <img src={r.driver.image} alt={r.driver?.name} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-[var(--color-ink)]">
                          {r.driver?.name}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-[var(--color-ink-muted)] sm:hidden">
                          {r.team?.name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell">
                    <div className="flex items-center gap-1.5">
                      {r.team?.logo ? (
                        <img src={r.team.logo} alt={r.team.name} className="h-4 w-4 object-contain" />
                      ) : null}
                      <span className="truncate text-[var(--color-ink-muted)]">{r.team?.name}</span>
                    </div>
                  </td>
                  <td className="text-center tabular-nums text-[var(--color-ink-muted)]">
                    {r.grid ?? "—"}
                  </td>
                  <td className="text-center tabular-nums text-[var(--color-ink-muted)]">
                    {r.laps ?? "—"}
                  </td>
                  <td className="pr-3 text-right font-display tabular-nums text-[var(--color-ink)]">
                    {r.time ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Constructor points this race */}
      {constructorPoints.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
            <Trophy className="h-3 w-3" /> Constructor points (this race)
          </h3>
          <div className="space-y-2">
            {constructorPoints.map((t: any) => {
              const pct = Math.max(4, Math.round((t.points / (maxPts || 1)) * 100));
              return (
                <div
                  key={t.name}
                  className="flex items-center gap-3 rounded-lg border border-[var(--color-surface-border)] bg-black/30 p-2.5"
                >
                  <div className="h-7 w-7 shrink-0 overflow-hidden rounded-md bg-[var(--surface-3)]">
                    {t.logo ? (
                      <img src={t.logo} alt={t.name} className="h-full w-full object-contain p-0.5" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-[var(--color-ink)]">{t.name}</div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-[var(--color-neon)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="font-display text-sm font-bold tabular-nums text-[var(--color-neon)]">
                    {t.points}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
