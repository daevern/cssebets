import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Card,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Zap, Clock, TrendingUp, ShieldCheck } from "lucide-react";
import { teamFlagUrl } from "@/lib/country-flags";
import { getLandingData, type LandingNextMatch, type LandingStats } from "@/lib/landing.functions";

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function Countdown({ targetIso }: { targetIso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const target = new Date(targetIso).getTime();
  const diff = target - now;
  if (diff <= 0) return null;
  return (
    <div className="mt-3 inline-flex flex-col items-center gap-0.5 rounded-lg border border-primary/30 bg-background/60 px-4 py-2 backdrop-blur lg:items-start">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        Next match starts in
      </span>
      <span className="font-mono text-xl font-black tabular-nums text-primary sm:text-2xl">
        {formatCountdown(diff)}
      </span>
    </div>
  );
}

function AnimatedNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  useEffect(() => {
    startRef.current = null;
    fromRef.current = display;
    let raf = 0;
    const step = (t: number) => {
      if (startRef.current == null) startRef.current = t;
      const p = Math.min(1, (t - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(fromRef.current + (value - fromRef.current) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{display.toLocaleString()}</>;
}

export function StatsRow({ stats }: { stats: LandingStats }) {
  const items = [
    { label: "Players", value: stats.registeredPlayers },
    { label: "Active today", value: stats.activeToday },
    { label: "Bets settled", value: stats.betsSettled },
    { label: "Points paid out", value: stats.pointsPaidOut },
  ];
  return (
    <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:max-w-xl">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-lg border border-border/70 bg-card/50 px-3 py-2 backdrop-blur transition-colors hover:border-primary/40"
        >
          <div className="font-mono text-base font-black tabular-nums text-foreground sm:text-lg">
            <AnimatedNumber value={it.value} />
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {it.label}
          </div>
        </div>
      ))}
    </div>
  );
}

const DEMO_MATCH: NonNullable<LandingNextMatch> = {
  id: "demo",
  homeTeam: "England",
  awayTeam: "Croatia",
  kickoffAt: new Date(Date.now() + (2 * 60 + 14) * 60 * 1000).toISOString(),
  homeOdds: 1.73,
  drawOdds: 3.8,
  awayOdds: 4.91,
};

export function FeaturedMatch({ match, authed }: { match: LandingNextMatch; authed: boolean | null }) {
  const m = match ?? DEMO_MATCH;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = new Date(m.kickoffAt).getTime() - now;
  const ko =
    diff <= 0
      ? "Live / starting"
      : formatCountdown(diff);
  const home = m.homeOdds ?? 2.0;
  const draw = m.drawOdds ?? 3.2;
  const away = m.awayOdds ?? 3.5;
  const stake = 100;
  const potential = Math.round(stake * home);

  return (
    <section className="border-b border-border bg-gradient-to-b from-background to-card/30">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-primary">
            <TrendingUp className="h-4 w-4" />
            Featured Match
          </h2>
          {!match && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Demo
            </span>
          )}
        </div>
        <Card className="overflow-hidden border-border/80 bg-card/90 p-0 shadow-xl shadow-primary/5">
          <div className="grid gap-0 sm:grid-cols-[1.2fr_1fr]">
            {/* Match info */}
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <span>FIFA World Cup</span>
                <span className="inline-flex items-center gap-1 text-primary">
                  <Clock className="h-3 w-3" />
                  Kickoff in {ko}
                </span>
              </div>
              <div className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">
                {m.homeTeam} <span className="text-muted-foreground">vs</span> {m.awayTeam}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {[
                  { lbl: "1", sub: m.homeTeam, odds: home },
                  { lbl: "X", sub: "Draw", odds: draw },
                  { lbl: "2", sub: m.awayTeam, odds: away },
                ].map((o) => (
                  <button
                    key={o.lbl}
                    className="group flex flex-col items-center gap-0.5 rounded-md border border-border bg-background/70 px-2 py-2.5 text-xs transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/10 hover:shadow-md hover:shadow-primary/20"
                  >
                    <span className="font-semibold text-muted-foreground group-hover:text-foreground">
                      {o.lbl} · {o.sub.slice(0, 8)}
                    </span>
                    <span className="font-mono text-base font-bold text-foreground">
                      {Number(o.odds).toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {/* Slip */}
            <div className="border-t border-border/70 bg-muted/20 p-5 sm:border-l sm:border-t-0 sm:p-6">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Quick bet slip
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Stake</span>
                <span className="font-mono font-semibold">{stake} pts</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Potential return</span>
                <span className="font-mono text-lg font-black text-primary">
                  {potential} pts
                </span>
              </div>
              <Link to={authed ? "/dashboard" : "/register"} className="mt-4 block">
                <Button className="w-full gap-1.5 font-bold uppercase tracking-wide shadow-md shadow-primary/30 transition-transform hover:scale-[1.02]">
                  <Zap className="h-3.5 w-3.5" />
                  Place Prediction
                </Button>
              </Link>
              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                Points only · No real money required
              </p>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

export function TrustBadgesInteractive({
  items,
}: {
  items: { Icon: React.ComponentType<{ className?: string }>; label: string; tip: string }[];
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground sm:text-sm lg:justify-start">
        {items.map(({ Icon, label, tip }) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-default items-center gap-1.5 rounded-md border border-border bg-card/60 px-2.5 py-1.5 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card hover:shadow-md hover:shadow-primary/10">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <Icon className="h-3.5 w-3.5 text-primary/70" />
                {label}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              {tip}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

export function useLandingData() {
  const fn = useServerFn(getLandingData);
  const [data, setData] = useState<{ nextMatch: LandingNextMatch; stats: LandingStats } | null>(
    null,
  );
  useEffect(() => {
    let mounted = true;
    fn()
      .then((d) => {
        if (mounted) setData(d);
      })
      .catch(() => {
        if (mounted)
          setData({
            nextMatch: null,
            stats: {
              registeredPlayers: 0,
              activeToday: 0,
              betsSettled: 0,
              pointsPaidOut: 0,
            },
          });
      });
    return () => {
      mounted = false;
    };
  }, [fn]);
  return data;
}
