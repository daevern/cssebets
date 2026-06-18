import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Zap,
  ChevronRight,
  Ticket,
  Flame,
  Link2,
  ChevronUp,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLandingData } from "@/components/HeroEnhancements";
import { supabase } from "@/integrations/supabase/client";
import { getMyWallet } from "@/lib/wallet.functions";
import { teamFlagUrl } from "@/lib/country-flags";
import { CsseLogo } from "@/components/brand/CsseMark";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "cssebets" },
      { name: "description", content: "Private prediction pool for the 2026 World Cup." },
    ],
  }),
  component: Dashboard,
});

function TeamFlag({ name }: { name: string }) {
  const url = teamFlagUrl(name, 160);
  if (!url) {
    return (
      <div className="grid h-10 w-14 place-items-center rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink)]">
        {name.slice(0, 3)}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`${name} flag`}
      className="h-10 w-14 shrink-0 rounded-md border border-[var(--color-surface-border)] object-cover shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
      loading="lazy"
    />
  );
}

function DigitCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="grid h-16 w-16 place-items-center rounded-lg border border-[var(--color-surface-border)] bg-[#0A1410]">
        <span
          key={value}
          className="font-display text-3xl font-bold tabular-nums text-[var(--color-ink)]"
        >
          {value}
        </span>
      </div>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
        {label}
      </span>
    </div>
  );
}

function ColonDots() {
  return (
    <div className="flex flex-col items-center gap-1 pb-5">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-neon)]" />
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-neon)]" />
    </div>
  );
}

function Countdown({ kickoff }: { kickoff: string | null }) {
  const target = useMemo(
    () => (kickoff ? new Date(kickoff).getTime() : Date.now() + 6 * 60 * 60 * 1000),
    [kickoff],
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, target - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (x: number) => x.toString().padStart(2, "0");

  return (
    <div className="flex items-center justify-center gap-2">
      <DigitCell value={pad(h)} label="H" />
      <ColonDots />
      <DigitCell value={pad(m)} label="M" />
      <ColonDots />
      <DigitCell value={pad(s)} label="S" />
    </div>
  );
}

function Pill({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink)] ${accent ? "border-[var(--color-neon)]/50 bg-[var(--color-neon)]/5" : "border-[var(--color-surface-border)] bg-transparent"}`}
    >
      {children}
    </span>
  );
}

function Dashboard() {
  const landing = useLandingData();
  const next = landing?.nextMatches?.[0] ?? null;
  const kickoff = next?.kickoffAt ?? null;

  const { user } = useAuth();
  const uid = user?.id;

  const walletFn = useServerFn(getMyWallet);
  const wallet = useQuery({
    queryKey: ["my-wallet", uid],
    enabled: !!uid,
    queryFn: () => walletFn({}),
    staleTime: 15_000,
  });
  const balance = Math.round(wallet.data?.balance ?? 0);

  const { data: picks } = useQuery({
    queryKey: ["dashboard-active-picks", uid],
    enabled: !!uid,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("id, status, points, potential_return")
        .eq("user_id", uid!)
        .eq("status", "pending");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        status: string;
        points: number;
        potential_return: number;
      }>;
    },
  });

  const liveCount = picks?.length ?? 0;
  const biggestStake = picks?.reduce((m, p) => Math.max(m, p.points ?? 0), 0) ?? 0;
  const expectedPayout =
    picks?.reduce((s, p) => s + (p.potential_return ?? 0), 0) ?? 0;
  const totalRisked = picks?.reduce((s, p) => s + (p.points ?? 0), 0) ?? 0;
  const potentialWin = Math.max(0, expectedPayout - totalRisked);

  const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

  return (
    <div className="min-h-screen bg-[var(--color-surface)] px-4 py-6">
      <div className="mx-auto flex max-w-md flex-col gap-4 md:max-w-2xl">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CsseLogo size={22} />
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-neon)]/40 bg-transparent px-3 py-1.5 text-sm font-bold text-[var(--color-ink)]">
            <Link2 className="h-3.5 w-3.5 text-[var(--color-neon)]" />
            <span className="tabular-nums">{wallet.isLoading ? "…" : balance}</span>
            <span className="text-[var(--color-neon)]">CSSE</span>
          </span>
        </div>

        {/* Tier + streak pills — TODO: wire to real engagement/tier data */}
        <div className="flex items-center gap-2">
          <Pill accent>
            <ChevronUp className="h-3.5 w-3.5 text-[var(--color-neon)]" strokeWidth={3} />
            Bronze
          </Pill>
          <Pill>
            <Flame className="h-3 w-3 text-[var(--color-ink-muted)]" />
            2D
          </Pill>
        </div>

        {/* NEXT UP CARD */}
        <div className="relative overflow-hidden rounded-2xl border border-[var(--color-neon)]/20 bg-[var(--color-surface-2)] p-5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-neon)]">
              <Zap className="h-3.5 w-3.5" />
              Next Up
            </span>
            <ChevronRight className="h-4 w-4 text-[var(--color-ink-muted)]" />
          </div>

          <div className="mt-6 flex items-center justify-center gap-4">
            <TeamFlag name={next?.homeTeam ?? "TBD"} />
            <span className="rounded-md border border-[var(--color-neon)]/30 bg-[#0A1410] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-neon)]">
              VS
            </span>
            <TeamFlag name={next?.awayTeam ?? "TBD"} />
          </div>

          <div className="mt-6">
            <Countdown kickoff={kickoff} />
          </div>

          <Link to="/bets" className="mt-6 block">
            <button
              type="button"
              className="w-full rounded-full bg-[var(--color-neon)] px-4 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-black shadow-[0_0_24px_var(--color-neon-glow)] transition-all hover:brightness-110 active:scale-[0.99]"
            >
              Make a bet
            </button>
          </Link>
        </div>

        {/* PICKS CARD */}
        <div className="rounded-2xl border border-[var(--color-neon)]/20 bg-[var(--color-surface-2)] p-5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-neon)]">
              <Ticket className="h-3.5 w-3.5" />
              Picks · {liveCount} Live Today
            </span>
            <ChevronRight className="h-4 w-4 text-[var(--color-ink-muted)]" />
          </div>

          {liveCount > 0 ? (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-[var(--color-surface-border)] bg-[#0A1410] p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                    Biggest Stake
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="font-display text-2xl font-bold tabular-nums text-[var(--color-ink)]">
                      {fmt(biggestStake)}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
                      pts
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--color-surface-border)] bg-[#0A1410] p-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-neon)]">
                    <TrendingUp className="h-3 w-3" />
                    Expected Payout
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="font-display text-2xl font-bold tabular-nums text-[var(--color-neon)]">
                      {fmt(expectedPayout)}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-neon)]/70">
                      pts
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 border-t border-[var(--color-surface-border)] pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                Risked <span className="tabular-nums text-[var(--color-ink)]">{fmt(totalRisked)}</span> → Win{" "}
                <span className="tabular-nums text-[var(--color-ink)]">{fmt(potentialWin)}</span>
              </div>
            </>
          ) : (
            <>
              <h2 className="mt-4 text-xl font-bold tracking-tight text-[var(--color-ink)]">
                You're on the sideline.
              </h2>
              <Link to="/bets" className="mt-5 block">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-[var(--color-surface-border)] bg-[#0A1410] px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-ink)] transition-all hover:border-[var(--color-neon)] hover:text-[var(--color-neon)] active:scale-[0.99]"
                >
                  <span>Make a pick</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
