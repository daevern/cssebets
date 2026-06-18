import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Zap, ChevronRight, Target, Flame, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLandingData } from "@/components/HeroEnhancements";
import { supabase } from "@/integrations/supabase/client";
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
      <span className="truncate text-sm font-bold uppercase tracking-wider text-foreground">
        {name}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={`${name} flag`}
      className="h-10 w-16 shrink-0 border border-border/40 object-cover shadow-sm"
      loading="lazy"
    />
  );
}

function DigitCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="grid h-16 w-16 place-items-center rounded-xl bg-background sm:h-[72px] sm:w-[72px]">
        <span
          key={value}
          className="animate-fade-in font-mono text-3xl font-black tabular-nums text-foreground sm:text-[34px]"
        >
          {value}
        </span>
      </div>
      <span className="mt-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function Dot() {
  return (
    <span className="flex flex-col items-center gap-1 pb-5">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
    </span>
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
      <Dot />
      <DigitCell value={pad(m)} label="M" />
      <Dot />
      <DigitCell value={pad(s)} label="S" />
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
      {/* Brand header — same logo as nav */}
      <div className="flex items-center justify-between px-1">
        <CsseLogo size={20} />
      </div>

      {/* NEXT UP CARD */}
      <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-lg shadow-primary/5 sm:p-6">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
            <Zap className="h-3.5 w-3.5" />
            Next Up
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
        </div>

        <div className="mt-6 flex items-center justify-center gap-5 sm:gap-7">
          <TeamFlag name={next?.homeTeam ?? "TBD"} />
          <div className="rounded-md border border-primary/40 bg-primary/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
            VS
          </div>
          <TeamFlag name={next?.awayTeam ?? "TBD"} />
        </div>

        <div className="mt-6">
          <Countdown kickoff={kickoff} />
        </div>

        <Link to="/bets" className="mt-6 block">
          <button
            type="button"
            className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-primary px-4 py-3.5 text-sm font-extrabold uppercase tracking-[0.22em] text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:brightness-110 active:scale-[0.99]"
          >
            Make a bet
          </button>
        </Link>
      </div>

      {/* PICKS CARD */}
      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
            <Target className="h-3.5 w-3.5" />
            Picks · {liveCount} {liveCount > 0 ? "Live" : "Today"}
          </span>
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-primary/40 bg-primary/10 text-primary">
            <Flame className="h-4 w-4" />
          </span>
        </div>

        <h2 className="mt-3 text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
          {liveCount > 0
            ? liveCount === 1
              ? "You have 1 pick in play."
              : `You have ${liveCount} picks in play.`
            : "You're on the sideline."}
        </h2>

        <Link to={liveCount > 0 ? "/my-predictions" : "/bets"} className="mt-5 block">
          <button
            type="button"
            className="flex min-h-[52px] w-full items-center justify-between gap-2 rounded-2xl border border-border bg-background/40 px-4 py-3 text-sm font-extrabold uppercase tracking-[0.22em] text-foreground transition-all hover:border-primary hover:text-primary active:scale-[0.99]"
          >
            <span>{liveCount > 0 ? "View my picks" : "Make a pick"}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </Link>
      </div>
    </div>
  );
}
