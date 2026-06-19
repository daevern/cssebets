import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Zap,
  Ticket,
  Flame,
  Link2,
  TrendingUp,
  ArrowUpRight,
  Radio,
  Circle,
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
      { title: "Matchday — cssebets" },
      { name: "description", content: "The whistle is about to blow. Take a side." },
    ],
  }),
  component: Dashboard,
});

/* ------------ Country flag (mirrors /matches styling) ------------ */
function TeamFlag({ name, large = false }: { name: string; large?: boolean }) {
  const url = teamFlagUrl(name, large ? 320 : 160);
  const sizeCls = large ? "h-14 w-24" : "h-10 w-16";
  if (!url) {
    return (
      <div
        className={`grid ${sizeCls} place-items-center border border-border/40 bg-[var(--color-surface)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink)] shadow-sm`}
      >
        {name.slice(0, 3)}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`${name} flag`}
      className={`${sizeCls} shrink-0 border border-border/40 object-cover shadow-sm`}
      loading="lazy"
    />
  );
}

/* --------------------- Stencil flip digits ---------------------- */
function DigitCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative grid h-16 w-14 place-items-center overflow-hidden border border-[var(--color-surface-border)] bg-[#070D0A]">
        <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-[var(--color-neon)]/15" />
        <span
          key={value}
          className="font-display text-[34px] font-bold leading-none tabular-nums text-[var(--color-ink)]"
        >
          {value}
        </span>
      </div>
      <span className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
        {label}
      </span>
    </div>
  );
}
function ColonDots() {
  return (
    <div className="flex flex-col items-center gap-1 pb-5">
      <span className="h-1 w-1 rounded-full bg-[var(--color-neon)]" />
      <span className="h-1 w-1 rounded-full bg-[var(--color-neon)]" />
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
    <div className="flex items-end justify-center gap-2">
      <DigitCell value={pad(h)} label="Hours" />
      <ColonDots />
      <DigitCell value={pad(m)} label="Min" />
      <ColonDots />
      <DigitCell value={pad(s)} label="Sec" />
    </div>
  );
}

/* ------------------------ Emotional copy ------------------------ */
function tensionLine(ms: number): { kicker: string; line: string } {
  if (ms <= 0)
    return { kicker: "Live now", line: "The whistle blew. Last chance to call it." };
  const mins = ms / 60_000;
  if (mins < 15)
    return { kicker: "Closing in", line: "Lines lock in minutes. Don't get caught watching." };
  if (mins < 60)
    return { kicker: "Under one hour", line: "Conviction wins matchdays. Take a side." };
  if (mins < 6 * 60)
    return { kicker: "Tonight's call", line: "Everyone has a guess. You have a position." };
  return { kicker: "On the slate", line: "Read the room. Then back yourself." };
}

/* --------------------------- Page --------------------------- */
function Dashboard() {
  const landing = useLandingData();
  const next = landing?.nextMatches?.[0] ?? null;
  const kickoff = next?.kickoffAt ?? null;

  const { user } = useAuth();
  const uid = user?.id;
  const firstName = (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0]
    ?? user?.email?.split("@")[0]
    ?? "Player";

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
  const expectedPayout = picks?.reduce((s, p) => s + (p.potential_return ?? 0), 0) ?? 0;
  const totalRisked = picks?.reduce((s, p) => s + (p.points ?? 0), 0) ?? 0;
  const potentialWin = Math.max(0, expectedPayout - totalRisked);

  const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

  const msToKick = kickoff ? Math.max(0, new Date(kickoff).getTime() - Date.now()) : 6 * 3600_000;
  const tension = tensionLine(msToKick);
  const isLive = kickoff && msToKick === 0;

  const slateCount = landing?.nextMatches?.length ?? 0;
  const activeToday = landing?.stats?.activeToday ?? 0;

  return (
    <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
      {/* Scoreboard grain background */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--color-neon) 0 1px, transparent 1px 3px)",
        }}
      />

      <div className="relative mx-auto flex max-w-md flex-col gap-5 px-4 py-5 md:max-w-2xl md:py-8">
        {/* ---------- Header ---------- */}
        <header className="flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <CsseLogo size={22} />
          </Link>
        </header>

        {/* ---------- Editorial greeting ---------- */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
            {isLive ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-neon)] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-neon)]" />
                </span>
                Live · Matchday
              </>
            ) : (
              <>
                <Radio className="h-3 w-3" />
                Matchday · {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </>
            )}
          </div>
          <h1 className="font-display text-[28px] font-bold leading-[1.05] tracking-tight md:text-4xl">
            Hello, <span className="text-[var(--color-neon)]">{firstName}</span>.
            <br />
            <span className="text-[var(--color-ink-muted)]">Ready to strategise?</span>
          </h1>
        </section>

        {/* ---------- NEXT UP — hero fixture card ---------- */}
        <article className="relative overflow-hidden border border-[var(--color-neon)]/25 bg-[var(--color-surface-2)]">
          {/* corner tick marks */}
          <Corner pos="tl" />
          <Corner pos="tr" />
          <Corner pos="bl" />
          <Corner pos="br" />

          {/* Stencil header band */}
          <div className="flex items-center justify-between border-b border-dashed border-[var(--color-surface-border)] px-5 py-3">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
              <Zap className="h-3 w-3" />
              Fixture №01 · Next Up
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
              {tension.kicker}
            </span>
          </div>

          <div className="px-5 pb-5 pt-6">
            {/* Teams row — flags above names, matches-page style */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="flex flex-col items-center gap-2">
                <TeamFlag name={next?.homeTeam ?? "TBD"} large />
                <span className="max-w-[110px] truncate text-center text-sm font-bold uppercase tracking-wide">
                  {next?.homeTeam ?? "TBD"}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="font-display text-xl font-bold leading-none text-[var(--color-ink-muted)]">
                  vs
                </span>
                <span className="h-8 w-px bg-[var(--color-neon)]/40" />
              </div>
              <div className="flex flex-col items-center gap-2">
                <TeamFlag name={next?.awayTeam ?? "TBD"} large />
                <span className="max-w-[110px] truncate text-center text-sm font-bold uppercase tracking-wide">
                  {next?.awayTeam ?? "TBD"}
                </span>
              </div>
            </div>

            {/* Countdown */}
            <div className="mt-6">
              <Countdown kickoff={kickoff} />
            </div>

            {/* Odds teaser — psychological micro-commitment */}
            {(next?.homeOdds || next?.drawOdds || next?.awayOdds) && (
              <div className="mt-6 grid grid-cols-3 gap-2">
                <OddsChip label={next?.homeTeam ?? "Home"} odds={next?.homeOdds} side="L" />
                <OddsChip label="Draw" odds={next?.drawOdds} side="M" />
                <OddsChip label={next?.awayTeam ?? "Away"} odds={next?.awayOdds} side="R" />
              </div>
            )}

            <Link to="/bets" className="mt-5 block">
              <button
                type="button"
                className="group flex w-full items-center justify-between rounded-full bg-[var(--color-neon)] px-5 py-4 text-sm font-bold uppercase tracking-[0.22em] text-black shadow-[0_0_32px_var(--color-neon-glow)] transition-all hover:brightness-110 active:scale-[0.99]"
              >
                <span>Lock in your call</span>
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
            </Link>

            {/* Tournament pulse */}
            <div className="mt-4 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <Circle className="h-1.5 w-1.5 fill-[var(--color-neon)] text-[var(--color-neon)]" />
                {slateCount} on the slate
              </span>
              <span>{fmt(activeToday)} players live</span>
            </div>
          </div>
        </article>

        {/* ---------- YOUR POSITION (Picks) ---------- */}
        <article className="border border-[var(--color-surface-border)] bg-[var(--color-surface-2)]">
          <div className="flex items-center justify-between border-b border-dashed border-[var(--color-surface-border)] px-5 py-3">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
              <Ticket className="h-3 w-3" />
              Your Position · {liveCount} in play
            </span>
            {liveCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon)]">
                <Flame className="h-3 w-3" /> Hot
              </span>
            )}
          </div>

          <div className="px-5 py-5">
            {liveCount > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <StatBlock
                    label="Biggest stake"
                    value={fmt(biggestStake)}
                    unit="pts"
                  />
                  <StatBlock
                    label="If it all hits"
                    value={fmt(expectedPayout)}
                    unit="pts"
                    accent
                    icon={<TrendingUp className="h-3 w-3" />}
                  />
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-dashed border-[var(--color-surface-border)] pt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                  <span>
                    Risked{" "}
                    <span className="tabular-nums text-[var(--color-ink)]">{fmt(totalRisked)}</span>
                  </span>
                  <span className="text-[var(--color-neon)]">
                    Win{" "}
                    <span className="tabular-nums">+{fmt(potentialWin)}</span>
                  </span>
                </div>
                <Link to="/my-predictions" className="mt-4 block">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-[var(--color-surface-border)] bg-[#070D0A] px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] transition-colors hover:border-[var(--color-neon)] hover:text-[var(--color-neon)]"
                  >
                    <span>Watch your picks</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                </Link>
              </>
            ) : (
              <>
                <p className="font-display text-2xl font-bold leading-tight tracking-tight">
                  You're on the sideline.
                </p>
                <p className="mt-1.5 text-sm text-[var(--color-ink-muted)]">
                  Spectators don't get paid. Pick one fixture. Back the read.
                </p>
                <Link to="/bets" className="mt-4 block">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-[var(--color-neon)]/40 bg-[var(--color-neon)]/5 px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] text-[var(--color-neon)] transition-colors hover:bg-[var(--color-neon)]/10"
                  >
                    <span>Get in the game</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                </Link>
              </>
            )}
          </div>
        </article>

        {/* Footer tagline — brand soul */}
        <p className="pt-2 text-center text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--color-ink-muted)]">
          cssebets · Skill over noise
        </p>
      </div>
    </div>
  );
}

/* --------------------------- bits --------------------------- */
function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const map: Record<typeof pos, string> = {
    tl: "top-0 left-0 border-t border-l",
    tr: "top-0 right-0 border-t border-r",
    bl: "bottom-0 left-0 border-b border-l",
    br: "bottom-0 right-0 border-b border-r",
  };
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute h-3 w-3 border-[var(--color-neon)] ${map[pos]}`}
    />
  );
}

function OddsChip({
  label,
  odds,
  side,
}: {
  label: string;
  odds: number | null | undefined;
  side: "L" | "M" | "R";
}) {
  const align = side === "L" ? "items-start" : side === "R" ? "items-end" : "items-center";
  return (
    <Link
      to="/bets"
      className={`flex ${align} flex-col gap-1 border border-[var(--color-surface-border)] bg-[#070D0A] px-3 py-2.5 transition-colors hover:border-[var(--color-neon)]`}
    >
      <span className="max-w-full truncate text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
        {label}
      </span>
      <span className="font-display text-lg font-bold tabular-nums text-[var(--color-ink)]">
        {odds != null ? odds.toFixed(2) : "—"}
      </span>
    </Link>
  );
}

function StatBlock({
  label,
  value,
  unit,
  accent,
  icon,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={`border bg-[#070D0A] p-4 ${accent ? "border-[var(--color-neon)]/40" : "border-[var(--color-surface-border)]"}`}
    >
      <div
        className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] ${accent ? "text-[var(--color-neon)]" : "text-[var(--color-ink-muted)]"}`}
      >
        {icon}
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span
          className={`font-display text-2xl font-bold tabular-nums ${accent ? "text-[var(--color-neon)]" : "text-[var(--color-ink)]"}`}
        >
          {value}
        </span>
        <span
          className={`text-[10px] font-bold uppercase tracking-widest ${accent ? "text-[var(--color-neon)]/70" : "text-[var(--color-ink-muted)]"}`}
        >
          {unit}
        </span>
      </div>
    </div>
  );
}
