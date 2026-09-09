import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2, Trophy, Users, Clock, Sparkles } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { PageFooter } from "@/components/ui/page-footer";
import { getFantasyOverview } from "@/features/fantasy/fantasy.functions";

export const Route = createFileRoute("/_authenticated/fantasy/")({
  component: FantasyLobby,
});

function useCountdown(iso?: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!iso) return null;
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return "Locked";
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`;
}

const POS_TONE: Record<string, string> = {
  GK: "bg-amber-500/15 text-amber-300",
  DEF: "bg-sky-500/15 text-sky-300",
  MID: "bg-emerald-500/15 text-emerald-300",
  FWD: "bg-rose-500/15 text-rose-300",
};

function FantasyLobby() {
  const fetchOverview = useServerFn(getFantasyOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["fantasy", "overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 60_000,
  });
  const [tab, setTab] = useState<"round" | "season">("round");
  const countdown = useCountdown(data?.gameweek?.deadlineAt);

  if (isLoading) {
    return (
      <PageShell kicker="Fantasy" title="Fantasy XI">
        <div className="grid place-items-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--neon)]" />
        </div>
      </PageShell>
    );
  }

  const gw = data?.gameweek ?? null;
  const entry = data?.entry ?? null;

  return (
    <PageShell kicker="Three leagues, one team" title="Fantasy" titleAccent="XI">
      <div className="space-y-5 pb-24">
        <section className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-4">
          {gw ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-dim)]">
                    {gw.name} · EPL · La Liga · Serie A
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold">
                    {entry ? `${entry.points} pts` : "No team yet"}
                  </h2>
                  {entry?.rank ? (
                    <p className="text-sm text-[var(--color-ink-dim)]">Rank #{entry.rank}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="flex items-center justify-end gap-1 text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-dim)]">
                    <Clock className="h-3 w-3" /> Deadline
                  </p>
                  <p className="mt-1 font-mono text-lg tabular-nums text-[var(--neon)]">
                    {countdown}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Stat label="Entry" value={`${gw.entryFee} pts`} icon={<Sparkles className="h-3.5 w-3.5" />} />
                <Stat label="Prize pool" value={`${gw.prizePool} pts`} icon={<Trophy className="h-3.5 w-3.5" />} />
                <Stat label="Managers" value={String(data?.entrants ?? 0)} icon={<Users className="h-3.5 w-3.5" />} />
              </div>

              <Link
                to="/fantasy/squad"
                className="mt-4 block rounded-xl bg-[var(--neon)] px-4 py-3 text-center text-sm font-semibold text-black transition-opacity hover:opacity-90"
              >
                {entry ? (gw.isOpen ? "Edit my XI" : "View my XI") : "Pick my XI"}
              </Link>
              {!gw.isOpen ? (
                <p className="mt-2 text-center text-xs text-[var(--color-ink-dim)]">
                  Round locked — points update as matches finish.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-[var(--color-ink-dim)]">
              The next fantasy round opens shortly. Check back soon.
            </p>
          )}
        </section>

        {entry?.picks?.length ? (
          <section className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-4">
            <h3 className="text-sm font-semibold">Your eleven</h3>
            <ul className="mt-3 space-y-2">
              {entry.picks.map((p: any) => (
                <li key={p.player.id} className="flex items-center gap-3 rounded-xl bg-[var(--surface-3,rgba(255,255,255,0.03))] px-3 py-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${POS_TONE[p.player.position]}`}>
                    {p.player.position}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {p.player.name}
                    {p.role === "captain" ? <span className="ml-1 text-[10px] font-bold text-[var(--neon)]">(C)</span> : null}
                    {p.role === "vice" ? <span className="ml-1 text-[10px] text-[var(--color-ink-dim)]">(V)</span> : null}
                  </span>
                  <span className="truncate text-xs text-[var(--color-ink-dim)]">{p.player.teamName}</span>
                  <span className="w-10 text-right font-mono text-sm tabular-nums">{p.points}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-4">
          <div className="flex gap-2">
            {(["round", "season"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  tab === t
                    ? "bg-[var(--neon)] text-black"
                    : "bg-[var(--surface-3,rgba(255,255,255,0.05))] text-[var(--color-ink-dim)]"
                }`}
              >
                {t === "round" ? "This round" : "Season table"}
              </button>
            ))}
          </div>

          <ul className="mt-3 divide-y divide-[var(--color-surface-border)]/60">
            {(tab === "round" ? (data?.leaderboard ?? []) : (data?.season ?? [])).map((row: any, i: number) => (
              <li
                key={`${row.displayName}-${i}`}
                className={`flex items-center gap-3 py-2 text-sm ${row.isYou ? "text-[var(--neon)]" : ""}`}
              >
                <span className="w-6 font-mono text-xs tabular-nums text-[var(--color-ink-dim)]">{row.rank}</span>
                <span className="min-w-0 flex-1 truncate">{row.isYou ? "You" : row.displayName}</span>
                {tab === "season" ? (
                  <span className="text-xs text-[var(--color-ink-dim)]">{row.entries} rounds</span>
                ) : null}
                <span className="w-14 text-right font-mono tabular-nums">{row.points}</span>
              </li>
            ))}
            {!(tab === "round" ? data?.leaderboard?.length : data?.season?.length) ? (
              <li className="py-6 text-center text-sm text-[var(--color-ink-dim)]">
                No entries yet — be the first in.
              </li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-4 text-xs text-[var(--color-ink-dim)]">
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">How points work</h3>
          <ul className="mt-2 space-y-1">
            <li>Playing 60+ minutes: 2 pts (1 pt for a shorter run-out)</li>
            <li>Goal: 6 (GK/DEF), 5 (MID), 4 (FWD) · Assist: 3</li>
            <li>Clean sheet: 4 (GK/DEF), 1 (MID) · Every 3 saves: 1</li>
            <li>Yellow: -1 · Red: -3 · Penalty missed: -2 · 2 goals conceded: -1 (GK/DEF)</li>
            <li>Your captain scores double. Budget 100m, max 3 players per club.</li>
          </ul>
        </section>
      </div>
      <PageFooter />
    </PageShell>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[var(--surface-3,rgba(255,255,255,0.04))] px-2 py-2">
      <p className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-dim)]">
        {icon} {label}
      </p>
      <p className="mt-1 font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}
