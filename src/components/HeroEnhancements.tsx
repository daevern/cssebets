import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Card,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Zap, Clock, TrendingUp, ShieldCheck } from "lucide-react";
import { teamFlagUrl } from "@/lib/country-flags";
import {
  MARKET_LABELS,
  selectionLabel,
  CORRECT_SCORES,
  HTFT_OPTIONS,
  EXACT_GOALS_OPTIONS,
  type MarketKey,
} from "@/lib/markets-catalog";
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
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-primary">
            <TrendingUp className="h-4 w-4" />
            Next Match
          </h2>
          {!match && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Demo
            </span>
          )}
        </div>

        {/* Mirror of the real MatchCard UI used inside the app */}
        <Card className="p-4 space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Group Stage
              </div>
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Kickoff in {ko}
              </div>
            </div>
            <div className="grid grid-cols-3 items-center text-lg font-semibold gap-3">
              <div className="flex justify-center"><PreviewFlag name={m.homeTeam} /></div>
              <span className="text-muted-foreground text-sm text-center">vs</span>
              <div className="flex justify-center"><PreviewFlag name={m.awayTeam} /></div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              {[
                { p: "HOME" as const, label: m.homeTeam, price: home },
                { p: "DRAW" as const, label: "Draw", price: draw },
                { p: "AWAY" as const, label: m.awayTeam, price: away },
              ].map((o) => (
                <Button
                  key={o.p}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex flex-col h-auto py-2"
                  asChild
                >
                  <Link to={authed ? "/dashboard" : "/register"}>
                    <span className="truncate max-w-full text-xs">{o.label}</span>
                    <span className="font-bold">{Number(o.price).toFixed(2)}</span>
                  </Link>
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                value={stake}
                readOnly
                aria-label="Stake preview"
                className="pointer-events-none"
              />
              <Button asChild>
                <Link to={authed ? "/dashboard" : "/register"}>
                  <Zap className="h-3.5 w-3.5 mr-1" />
                  Bet Now
                </Link>
              </Button>
            </div>
            <div className="text-[10px] text-muted-foreground">
              Potential return: <span className="font-mono font-semibold text-primary">{potential} pts</span> · Points only · No real money required
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

function PreviewFlag({ name }: { name: string }) {
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
