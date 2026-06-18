import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CsseLogo } from "@/components/brand/CsseMark";
import { useLandingData } from "@/components/HeroEnhancements";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { teamFlagUrl } from "@/lib/country-flags";

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
      <span className="truncate text-base font-bold uppercase tracking-wide text-foreground sm:text-lg">
        {name}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={`${name} flag`}
      className="h-10 w-16 rounded-sm border border-border/40 object-cover shadow-sm sm:h-12 sm:w-20"
      loading="lazy"
    />
  );
}

function AnimatedDigit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-xl border border-border/60 bg-background/60 py-3">
      <span
        key={value}
        className="animate-fade-in font-mono text-3xl font-black tabular-nums tracking-tight text-foreground sm:text-4xl"
      >
        {value}
      </span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
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
    <div className="flex items-center gap-2">
      <AnimatedDigit value={pad(h)} label="H" />
      <span className="font-mono text-2xl font-bold text-muted-foreground/40">:</span>
      <AnimatedDigit value={pad(m)} label="M" />
      <span className="font-mono text-2xl font-bold text-muted-foreground/40">:</span>
      <AnimatedDigit value={pad(s)} label="S" />
    </div>
  );
}

function Dashboard() {
  const landing = useLandingData();
  const next = landing?.nextMatches?.[0] ?? null;
  const kickoff = next?.kickoffAt ?? null;

  const { user } = useAuth();
  const uid = user?.id;

  const { data: activePicks } = useQuery({
    queryKey: ["dashboard-active-picks", uid],
    enabled: !!uid,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("id, status, matches(status)")
        .eq("user_id", uid!)
        .eq("status", "pending");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; status: string; matches: { status: string } | null }>;
    },
  });

  const liveCount = activePicks?.length ?? 0;

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4">
      <div className="flex items-center justify-between">
        <CsseLogo size={24} />
        <span className="hidden text-xs uppercase tracking-[0.18em] text-muted-foreground sm:inline">
          Competitive Strategy Starts Everywhere
        </span>
      </div>

      {/* Card 1 — Next Match */}
      <div className="group relative rounded-2xl bg-gradient-to-br from-primary/40 via-border to-border p-px transition-transform duration-300 hover:-translate-y-0.5">
        <div className="rounded-2xl bg-card p-6 shadow-lg shadow-primary/5">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
              ⚡ Next Up
            </div>
            <span className="text-muted-foreground/60" aria-hidden>›</span>
          </div>

          <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
            <div className="flex min-w-0 justify-end">
              <TeamFlag name={next?.homeTeam ?? "TBD"} />
            </div>
            <div className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
              VS
            </div>
            <div className="flex min-w-0 justify-start">
              <TeamFlag name={next?.awayTeam ?? "TBD"} />
            </div>
          </div>

          <div className="mt-6">
            <Countdown kickoff={kickoff} />
          </div>

          <Link to="/bets" className="mt-6 block">
            <button
              type="button"
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-md shadow-primary/30 transition-all hover:shadow-lg hover:shadow-primary/50 active:scale-[0.99]"
            >
              Make a bet
              <span aria-hidden>→</span>
            </button>
          </Link>
        </div>
      </div>

      {/* Card 2 — Picks */}
      <div className="group relative rounded-2xl bg-gradient-to-br from-border via-border to-primary/20 p-px transition-transform duration-300 hover:-translate-y-0.5">
        <div className="rounded-2xl bg-card p-6">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              ◎ Picks · {liveCount} Live
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground/80">
            {liveCount > 0
              ? `You have ${liveCount} active pick${liveCount === 1 ? "" : "s"} in play.`
              : "No picks today."}
          </p>
          <Link to={liveCount > 0 ? "/my-predictions" : "/bets"} className="mt-5 block">
            <button
              type="button"
              className="flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl border border-border bg-background/40 px-4 py-3 text-sm font-bold uppercase tracking-wider text-foreground transition-all hover:border-primary hover:text-primary active:scale-[0.99]"
            >
              <span>{liveCount > 0 ? "View my picks" : "Make a pick"}</span>
              <span aria-hidden>→</span>
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
