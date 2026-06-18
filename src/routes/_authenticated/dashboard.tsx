import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const abbr = (name ?? "TBD").slice(0, 3).toUpperCase();
  return (
    <div className="flex flex-col items-center gap-2">
      {url ? (
        <img
          src={url}
          alt={`${name} flag`}
          className="h-10 w-16 object-cover shadow-sm border border-border/40 shrink-0"
          loading="lazy"
        />
      ) : (
        <span className="grid h-10 w-16 place-items-center border border-border/40 bg-muted/30 text-[10px] font-bold tracking-widest text-muted-foreground">
          {abbr}
        </span>
      )}
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {url ? abbr : name}
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

  const Cell = ({ value, label }: { value: string; label: string }) => (
    <div className="text-center">
      <div
        key={value}
        className="animate-fade-in font-mono text-2xl font-bold leading-none tabular-nums text-foreground sm:text-3xl"
      >
        {value}
      </div>
      <div className="mt-1 font-mono text-[8px] font-bold uppercase tracking-tighter text-muted-foreground">
        {label}
      </div>
    </div>
  );

  return (
    <div className="flex items-end justify-center gap-3 font-mono">
      <Cell value={pad(h)} label="HRS" />
      <div className="pb-4 font-mono text-xl font-bold text-primary/50">:</div>
      <Cell value={pad(m)} label="MIN" />
      <div className="pb-4 font-mono text-xl font-bold text-primary/50">:</div>
      <Cell value={pad(s)} label="SEC" />
    </div>
  );
}

function matchOpCode(m: { kickoffAt?: string | null } | null) {
  if (!m?.kickoffAt) return "OP_2026_WC";
  const d = new Date(m.kickoffAt);
  const yy = d.getUTCFullYear().toString().slice(-2);
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = d.getUTCDate().toString().padStart(2, "0");
  return `OP_${yy}${mm}${dd}_WC`;
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
  const opCode = matchOpCode(next);

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      {/* Brand lockup — same mark + wordmark as nav/header */}
      <div className="mb-6 flex items-center px-1">
        <CsseLogo size={20} />
      </div>

      {/* NEXT UP CARD */}
      <div className="relative border border-border bg-card shadow-2xl shadow-primary/5">
        {/* Top accent rail */}
        <div className="absolute left-0 top-0 h-[2px] w-full bg-primary shadow-[0_0_10px_color-mix(in_oklab,var(--primary)_50%,transparent)]" />

        <div className="space-y-6 p-6">
          {/* Header strip */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Next Up
            </span>
            <span className="font-mono text-[9px] uppercase text-muted-foreground/70">
              {opCode}
            </span>
          </div>

          {/* Matchup */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-1 justify-center">
              <TeamFlag name={next?.homeTeam ?? "TBD"} />
            </div>
            <div className="flex flex-col items-center">
              <div className="border border-border bg-muted/40 px-3 py-1 text-[11px] font-black italic text-muted-foreground">
                VS
              </div>
            </div>
            <div className="flex flex-1 justify-center">
              <TeamFlag name={next?.awayTeam ?? "TBD"} />
            </div>
          </div>

          {/* Countdown */}
          <Countdown kickoff={kickoff} />

          {/* CTA */}
          <Link to="/bets" className="block">
            <button
              type="button"
              className="w-full bg-primary py-3.5 text-xs font-black uppercase tracking-[0.15em] text-primary-foreground transition-all hover:brightness-110 active:scale-[0.97]"
            >
              Make a bet
            </button>
          </Link>
        </div>
      </div>

      {/* PICKS STATUS CARD */}
      <div className="border border-border/60 bg-muted/20 p-6">
        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="space-y-1.5">
            <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
              Strategic Status
            </div>
            <p className="text-sm font-medium text-foreground">
              {liveCount > 0
                ? liveCount === 1
                  ? "1 pick in play."
                  : `${liveCount} picks in play.`
                : "You're on the sideline."}
            </p>
          </div>

          <Link to={liveCount > 0 ? "/my-predictions" : "/bets"} className="block w-full">
            <button
              type="button"
              className="w-full border border-border py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
            >
              {liveCount > 0 ? "View my picks" : "Make a pick"}
            </button>
          </Link>
        </div>
      </div>

      {/* HUD footer */}
      <div className="flex items-center px-1 opacity-30">
        <div className="h-px flex-1 bg-border" />
        <div className="mx-4 font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
          Restricted Access
        </div>
        <div className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
