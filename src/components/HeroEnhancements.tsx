import { useEffect, useRef, useState, useMemo } from "react";
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

// Static demo market odds shown on the landing preview. Shape mirrors
// what the real MarketTabs component renders so the user sees exactly
// what placing a bet looks like once they sign up.
const PREVIEW_ODDS: Partial<Record<MarketKey, Record<string, number>>> = {
  over_under_2_5: { OVER_2_5: 1.85, UNDER_2_5: 1.95 },
  btts: { YES: 1.80, NO: 2.00 },
  exact_total_goals: {
    GOALS_0: 11.0, GOALS_1: 5.50, GOALS_2: 3.80,
    GOALS_3: 4.20, GOALS_4: 6.50, GOALS_5_PLUS: 7.00,
  },
  correct_score: {
    "0-0": 11.0, "1-0": 7.50, "0-1": 8.50, "1-1": 6.00,
    "2-0": 9.00, "0-2": 11.0, "2-1": 8.50, "1-2": 10.0, "2-2": 14.0,
    "3-0": 17.0, "0-3": 21.0, "3-1": 15.0, "1-3": 18.0,
    "3-2": 26.0, "2-3": 31.0, "3-3": 51.0,
    "4-0": 41.0, "0-4": 67.0, "4-1": 41.0, "1-4": 51.0,
    "4-2": 67.0, "2-4": 81.0, OTHER: 26.0,
  },
  half_time_full_time: {
    HOME_HOME: 3.60, HOME_DRAW: 21.0, HOME_AWAY: 41.0,
    DRAW_HOME: 5.50, DRAW_DRAW: 5.00, DRAW_AWAY: 9.00,
    AWAY_HOME: 41.0, AWAY_DRAW: 26.0, AWAY_AWAY: 6.00,
  },
  to_qualify: { HOME: 1.72, AWAY: 2.10 },
};

const MIN_STAKE = 10;
const MAX_STAKE = 50000;

const DEMO_MATCH_1: NonNullable<LandingNextMatch> = {
  id: "demo1",
  homeTeam: "England",
  awayTeam: "Croatia",
  kickoffAt: new Date(Date.now() + (2 * 60 + 14) * 60 * 1000).toISOString(),
  homeOdds: 1.73,
  drawOdds: 3.8,
  awayOdds: 4.91,
};

const DEMO_MATCH_2: NonNullable<LandingNextMatch> = {
  id: "demo2",
  homeTeam: "Argentina",
  awayTeam: "France",
  kickoffAt: new Date(Date.now() + (5 * 60 + 45) * 60 * 1000).toISOString(),
  homeOdds: 2.15,
  drawOdds: 3.20,
  awayOdds: 3.10,
};

type Pick = { selection: string; odds: number };

function MatchFixtureCard({ m, authed }: { m: NonNullable<LandingNextMatch>; authed: boolean | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = new Date(m.kickoffAt).getTime() - now;
  const ko = diff <= 0 ? "Live / starting" : formatCountdown(diff);
  const home = m.homeOdds ?? 2.0;
  const draw = m.drawOdds ?? 3.2;
  const away = m.awayOdds ?? 3.5;

  const [resultPick, setResultPick] = useState<Pick | null>(null);
  const [resultStake, setResultStake] = useState<string>(String(MIN_STAKE));
  const ctaTo = authed ? "/dashboard" : "/register";

  return (
    <Card className="p-4 space-y-3 bg-card/60 backdrop-blur border-border hover:border-primary/30 transition-colors">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Round of 32
          </span>
          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
            <Clock className="h-3 w-3 text-primary" />
            Kickoff in {ko}
          </span>
        </div>
        <div className="grid grid-cols-3 items-center text-sm font-bold gap-3 py-1">
          <div className="flex flex-col items-center gap-1 text-center">
            <PreviewFlag name={m.homeTeam} />
            <span className="truncate max-w-[90px] text-xs font-semibold">{m.homeTeam}</span>
          </div>
          <span className="text-muted-foreground text-xs text-center font-normal">vs</span>
          <div className="flex flex-col items-center gap-1 text-center">
            <PreviewFlag name={m.awayTeam} />
            <span className="truncate max-w-[90px] text-xs font-semibold">{m.awayTeam}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          {[
            { p: "HOME", label: m.homeTeam, price: home },
            { p: "DRAW", label: "Draw", price: draw },
            { p: "AWAY", label: m.awayTeam, price: away },
          ].map((o) => {
            const isPicked = resultPick?.selection === o.p;
            return (
              <Button
                key={o.p}
                type="button"
                variant={isPicked ? "default" : "outline"}
                size="sm"
                className="flex flex-col h-auto py-1.5 px-1"
                onClick={() =>
                  setResultPick(isPicked ? null : { selection: o.p, odds: o.price })
                }
              >
                <span className="truncate max-w-full text-[10px] font-normal text-muted-foreground">{o.p === "DRAW" ? "Draw" : "Win"}</span>
                <span className="font-bold text-xs">{Number(o.price).toFixed(2)}</span>
              </Button>
            );
          })}
        </div>
        {resultPick && (
          <PreviewSlip
            marketLabel="Match Result"
            pick={resultPick}
            stake={resultStake}
            onStake={setResultStake}
            onClear={() => setResultPick(null)}
            ctaTo={ctaTo}
          />
        )}
      </div>
    </Card>
  );
}

export function FeaturedMatches({ matches, authed }: { matches: LandingNextMatch[]; authed: boolean | null }) {
  const displayedMatches = useMemo(() => {
    const list = [...(matches || [])].filter(Boolean) as NonNullable<LandingNextMatch>[];
    if (list.length >= 2) return list.slice(0, 2);
    if (list.length === 1) return [list[0], DEMO_MATCH_2];
    return [DEMO_MATCH_1, DEMO_MATCH_2];
  }, [matches]);

  return (
    <div className="mx-auto max-w-4xl py-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayedMatches.map((m) => (
          <MatchFixtureCard key={m.id} m={m} authed={authed} />
        ))}
      </div>
    </div>
  );
}

function PreviewSlip({
  marketLabel, pick, stake, onStake, onClear, ctaTo,
}: {
  marketLabel: string;
  pick: Pick;
  stake: string;
  onStake: (v: string) => void;
  onClear: () => void;
  ctaTo: string;
}) {
  const stakeNum = Number(stake);
  const valid = Number.isFinite(stakeNum) && stakeNum >= MIN_STAKE && stakeNum <= MAX_STAKE;
  const potential = valid ? (stakeNum * pick.odds).toFixed(2) : "0.00";
  return (
    <div className="space-y-2 p-3 rounded-md bg-muted/40 border animate-in fade-in-50 duration-200">
      <div className="text-xs flex justify-between items-center gap-2">
        <div className="truncate">
          <span className="font-semibold">{marketLabel}</span>
          {" · "}{selectionLabel(pick.selection)}
          {" · "}@ <span className="font-mono font-bold">{pick.odds.toFixed(2)}</span>
        </div>
        <Button
          variant="ghost" size="icon"
          className="h-4 w-4 text-muted-foreground hover:text-foreground shrink-0"
          onClick={onClear}
        >×</Button>
      </div>
      <div className="flex gap-2">
        <Input
          type="number" min={MIN_STAKE} max={MAX_STAKE} value={stake}
          onChange={(e) => onStake(e.target.value)}
          placeholder={`Stake (${MIN_STAKE}-${MAX_STAKE.toLocaleString()})`}
          className="h-8 text-xs"
        />
        <Button size="sm" className="h-8 text-xs shrink-0 gap-1" asChild>
          <Link to={ctaTo}>
            <Zap className="h-3 w-3" />
            Bet Now → {potential}
          </Link>
        </Button>
      </div>
      {!valid && (
        <div className="text-[10px] text-destructive">
          Enter a stake between {MIN_STAKE} and {MAX_STAKE.toLocaleString()} points.
        </div>
      )}
    </div>
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
  const [data, setData] = useState<{ nextMatches: LandingNextMatch[]; stats: LandingStats } | null>(
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
            nextMatches: [],
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
