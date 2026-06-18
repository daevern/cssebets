import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Zap, ChevronRight, Target, Flame, ArrowRight } from "lucide-react";
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
    return <span className="text-sm font-semibold truncate">{name}</span>;
  }
  return (
    <img
      src={url}
      alt={`${name} flag`}
      className="h-10 w-16 object-cover shadow-sm border border-border/40"
      loading="lazy"
    />
  );
}

function DigitBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="grid h-16 w-16 place-items-center rounded-md border border-border/70 bg-background/80 sm:h-20 sm:w-20">
        <span
          key={value}
          className="animate-fade-in font-mono text-3xl font-black tabular-nums tracking-tight text-foreground sm:text-4xl"
        >
          {value}
        </span>
      </div>
      <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
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
    <div className="flex items-center justify-center gap-3 sm:gap-4">
      <DigitBox value={pad(h)} label="H" />
      <span className="flex flex-col gap-1.5 pb-5">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
      </span>
      <DigitBox value={pad(m)} label="M" />
      <span className="flex flex-col gap-1.5 pb-5">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
      </span>
      <DigitBox value={pad(s)} label="S" />
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
        .select("id, status")
        .eq("user_id", uid!)
        .eq("status", "pending");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; status: string }>;
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
      <div className="relative rounded-2xl border border-border/80 bg-card p-5 shadow-lg shadow-primary/5 transition-transform duration-300 hover:-translate-y-0.5 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            <Zap className="h-3.5 w-3.5" />
            Next Up
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
        </div>

        <div className="mt-5 flex items-center justify-center gap-4 sm:gap-6">
          <TeamFlag name={next?.homeTeam ?? "TBD"} />
          <span className="rounded-md border border-primary/40 bg-primary/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
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
            className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-bold uppercase tracking-[0.2em] text-primary-foreground shadow-md shadow-primary/30 transition-all hover:shadow-lg hover:shadow-primary/50 active:scale-[0.99]"
          >
            Make a bet
          </button>
        </Link>
      </div>

      {/* Card 2 — Picks */}
      <div className="relative rounded-2xl border border-border/80 bg-card p-5 transition-transform duration-300 hover:-translate-y-0.5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            <Target className="h-3.5 w-3.5" />
            Picks · {liveCount} {liveCount > 0 ? "Live" : "Today"}
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-md border border-primary/40 bg-primary/10 text-primary">
            <Flame className="h-4 w-4" />
          </span>
        </div>

        <h2 className="mt-3 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {liveCount > 0
            ? liveCount === 1
              ? "You have 1 pick in play."
              : `You have ${liveCount} picks in play.`
            : "You're on the sideline."}
        </h2>

        <Link to={liveCount > 0 ? "/my-predictions" : "/bets"} className="mt-5 block">
          <button
            type="button"
            className="flex min-h-[52px] w-full items-center justify-between gap-2 rounded-xl border border-border bg-background/40 px-4 py-3 text-sm font-bold uppercase tracking-[0.2em] text-foreground transition-all hover:border-primary hover:text-primary active:scale-[0.99]"
          >
            <span>{liveCount > 0 ? "View my picks" : "Make a pick"}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </Link>
      </div>
    </div>
  );
}
