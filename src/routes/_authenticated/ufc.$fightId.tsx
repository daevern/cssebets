import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUfcFightDetail, getUfcMarketHistory, placeUfcBet } from "@/lib/ufc.functions";
import { Loader2, ArrowUpRight, X, Activity, Users, History } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { CsseLogo, BrandText } from "@/components/brand/CsseMark";

export const Route = createFileRoute("/_authenticated/ufc/$fightId")({
  head: () => ({
    meta: [
      { title: "UFC fight market — cssebets" },
      { name: "description", content: "Live UFC odds, market movement, tale of the tape, live stats and H2H." },
    ],
  }),
  component: UfcFightDetailPage,
});

type Market = {
  fight_id: string;
  market_type: "moneyline" | "method" | "round";
  selection_key: string;
  label: string;
  odds: number;
  is_active: boolean;
  updated_at: string;
};

const MIN_STAKE = 10;
const MAX_STAKE = 50000;

function UfcFightDetailPage() {
  const { fightId } = Route.useParams();
  const qc = useQueryClient();
  const detailFn = useServerFn(getUfcFightDetail);
  const historyFn = useServerFn(getUfcMarketHistory);

  const { data, isLoading } = useQuery({
    queryKey: ["ufc-fight-detail", fightId],
    queryFn: () => detailFn({ data: { fightId } }),
    refetchInterval: 10_000,
  });
  const { data: history } = useQuery({
    queryKey: ["ufc-market-history", fightId],
    queryFn: () => historyFn({ data: { fightId } }),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`ufc-fight-${fightId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ufc_fight_markets", filter: `fight_id=eq.${fightId}` }, () => {
        qc.invalidateQueries({ queryKey: ["ufc-fight-detail", fightId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ufc_fight_stats", filter: `fight_id=eq.${fightId}` }, () => {
        qc.invalidateQueries({ queryKey: ["ufc-fight-detail", fightId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fightId, qc]);

  return (
    <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
      <div
        className="relative mx-auto flex max-w-md flex-col gap-8 px-4 pt-5 md:max-w-3xl md:gap-10 md:py-10"
        style={{ paddingBottom: "calc(88px + env(safe-area-inset-bottom))" }}
      >
        {isLoading || !data ? (
          <div className="grid place-items-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-neon)]" />
          </div>
        ) : !data.fight ? (
          <div className="py-16 text-center text-sm text-[var(--color-ink-muted)]">Fight not found.</div>
        ) : (
          <FightAnalytics
            data={data as any}
            history={(history?.snapshots ?? []) as any[]}
          />
        )}

        <footer className="mt-6 flex items-center justify-between border-t border-[var(--color-surface-border)]/40 pt-6 text-[10px] font-medium tracking-[0.02em] text-[var(--color-ink-muted)]">
          <Link to="/ufc" className="flex items-center gap-2 hover:text-[var(--color-ink)]"><CsseLogo size={16} /></Link>
          <span>© {new Date().getFullYear()} <BrandText /></span>
        </footer>
      </div>
    </div>
  );
}

function FightAnalytics({ data, history }: { data: any; history: any[] }) {
  const { fight, fighterA, fighterB, markets, stats, h2h, event } = data;
  const isLive = fight.status && !["scheduled", "finished", "void"].includes(fight.status);
  const isFinished = fight.status === "finished";

  return (
    <>
      <nav className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">
        <span>Sports</span>
        <span className="mx-1.5 text-white/25">›</span>
        <Link to="/ufc" className="hover:text-white/80">UFC</Link>
        <span className="mx-1.5 text-white/25">›</span>
        <span>{event?.name ?? "Fight"}</span>
      </nav>

      <FightHero fight={fight} fighterA={fighterA} fighterB={fighterB} isLive={isLive} isFinished={isFinished} />

      {/* Market analytics — historical odds movement, mirrors MarketAnalyticsCard placement */}
      <MarketMovementSection markets={markets} snapshots={history} />

      {/* Take a position — mirrors football MarketTabs section header */}
      {!isFinished && (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold tracking-tight text-[var(--color-ink)] md:text-xl">
              Take a position
            </h2>
          </div>
          <MarketsBoard markets={markets} fight={fight} />
        </section>
      )}

      {/* Tale of the tape */}
      <AnalysisSection kicker={<><Users className="h-3 w-3" /> Tale of the tape</>}>
        <TaleOfTheTape a={fighterA} b={fighterB} fight={fight} />
      </AnalysisSection>

      {/* Live fight stats */}
      {(isLive || stats.length > 0) && (
        <AnalysisSection
          kicker={<><Activity className="h-3 w-3" /> Live fight stats</>}
          meta={isLive ? "Live" : "Final"}
        >
          <LiveStatsCompare stats={stats} homeName={fight.fighter_a} awayName={fight.fighter_b} />
        </AnalysisSection>
      )}

      {/* H2H */}
      <AnalysisSection
        kicker={<><History className="h-3 w-3" /> Head to head</>}
        meta={h2h.length > 0 ? `${h2h.length} prior` : "None"}
      >
        {h2h.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">These fighters haven't met before.</p>
        ) : (
          <ul className="space-y-2">
            {h2h.map((h: any) => (
              <li
                key={h.id}
                className="flex items-center justify-between border border-[var(--color-surface-border)]/70 bg-[var(--color-surface)]/45 px-3 py-2 text-xs"
              >
                <span className="text-[var(--color-ink-muted)]">{h.date}</span>
                <span className="font-bold text-[var(--color-ink)]">
                  {h.winner_slot === "a" ? fight.fighter_a : h.winner_slot === "b" ? fight.fighter_b : "Draw"}
                </span>
                <span className="text-[var(--color-ink-muted)]">{h.event_name ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </AnalysisSection>
    </>
  );
}

function AnalysisSection({ kicker, meta, children }: { kicker?: ReactNode; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="relative space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
        {kicker && (
          <span className="flex min-w-0 items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            {kicker}
          </span>
        )}
        {meta && (
          <span className="shrink-0 text-[10px] font-medium tracking-[0.02em] text-[var(--color-ink-muted)]">
            {meta}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/* ---------- Hero — mirrors football MatchHero article layout ---------- */

function FighterHeadshot({ url, name, size = 96 }: { url?: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="h-full w-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("");
  return (
    <div
      className="grid place-items-center bg-[var(--surface-3)] font-display text-lg font-semibold text-[var(--color-ink-muted)]"
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  );
}

function useCountdown(iso: string) {
  const [txt, setTxt] = useState("");
  useEffect(() => {
    const tick = () => {
      const ms = new Date(iso).getTime() - Date.now();
      if (ms <= 0) { setTxt(""); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setTxt(h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [iso]);
  return txt;
}

function FightHero({
  fight, fighterA, fighterB, isLive, isFinished,
}: {
  fight: any; fighterA: any; fighterB: any; isLive: boolean; isFinished: boolean;
}) {
  const kickoff = new Date(fight.commence_time);
  const dateStr = kickoff.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeStr = kickoff.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const countdown = useCountdown(fight.commence_time);

  const recordA = fighterA ? `${fighterA.record_w ?? 0}-${fighterA.record_l ?? 0}${fighterA.record_d ? `-${fighterA.record_d}` : ""}` : null;
  const recordB = fighterB ? `${fighterB.record_w ?? 0}-${fighterB.record_l ?? 0}${fighterB.record_d ? `-${fighterB.record_d}` : ""}` : null;

  return (
    <article className="relative flex flex-col gap-6">
      {/* Title + status — mirrors football hero title */}
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-[26px] font-semibold leading-[1.05] tracking-tight text-[var(--color-ink)] md:text-4xl">
          {fight.fighter_a} <span className="text-[var(--color-ink-muted)]/70">vs</span> {fight.fighter_b}
        </h1>
        <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.02em]">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 text-destructive">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
              </span>
              <span className="font-semibold uppercase tracking-[0.22em]">LIVE</span>
            </span>
          ) : isFinished ? (
            <span className="font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">Result</span>
          ) : countdown ? (
            <span className="text-[var(--color-ink-muted)]">
              Walkouts in <span className="font-semibold text-[var(--color-neon)]">{countdown}</span>
            </span>
          ) : (
            <span className="text-[var(--color-ink-muted)]">
              Walkouts <span className="text-[var(--color-ink)]">{dateStr} · {timeStr}</span>
            </span>
          )}
          <span className="text-[var(--color-ink-muted)]/60">·</span>
          <span className="text-[var(--color-ink-muted)]">
            {fight.card_position === "main" ? "Main Event" : fight.card_position === "co_main" ? "Co-Main Event" : "Fight"}
            {fight.weight_class ? ` · ${fight.weight_class}` : ""}
            {fight.is_title_fight ? " · Title" : ""}
          </span>
        </div>
      </div>

      {/* Scoreboard — headshots + VS, mirrors football's centered flag scoreboard */}
      <div className="flex items-center justify-center gap-5 sm:gap-8 md:gap-12">
        <ScoreFighter name={fight.fighter_a} logo={fight.fighter_a_logo || fighterA?.photo_url} record={recordA} />
        <div className="flex flex-col items-center">
          {isFinished && fight.winner ? (
            <span className="font-display text-4xl font-semibold tabular-nums text-[var(--color-ink)] sm:text-5xl md:text-6xl">
              {fight.winner === "a" ? "W" : fight.winner === "b" ? "L" : "D"}
              <span className="text-2xl font-light text-[var(--color-ink-muted)]/50 sm:text-3xl mx-1">–</span>
              {fight.winner === "b" ? "W" : fight.winner === "a" ? "L" : "D"}
            </span>
          ) : (
            <span className="font-display text-xl font-light tracking-tight text-[var(--color-ink-muted)] sm:text-2xl">vs</span>
          )}
          <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
            {fight.scheduled_rounds} rounds
          </span>
        </div>
        <ScoreFighter name={fight.fighter_b} logo={fight.fighter_b_logo || fighterB?.photo_url} record={recordB} />
      </div>

      {/* Divider before graph */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--color-surface-border)] to-transparent" />
    </article>
  );
}

function ScoreFighter({ name, logo, record }: { name: string; logo?: string | null; record: string | null }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-[var(--color-surface-border)] bg-[var(--surface-3)] sm:h-20 sm:w-20 md:h-24 md:w-24">
        <FighterHeadshot url={logo} name={name} size={96} />
      </div>
      <div className="text-center">
        <div className="max-w-[10ch] truncate font-display text-[11px] font-semibold text-[var(--color-ink)] sm:max-w-[16ch] sm:text-xs">{name}</div>
        {record && (
          <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-muted)] sm:text-[10px]">{record}</div>
        )}
      </div>
    </div>
  );
}

/* ---------- Markets board — mirrors football OddsButton + StakeSlip ---------- */

const MARKET_TABS: Array<{ id: "moneyline" | "method" | "round"; label: string }> = [
  { id: "moneyline", label: "Moneyline" },
  { id: "method", label: "Method" },
  { id: "round", label: "Round" },
];

function classifyUfc(selection: string): "home" | "away" | "neutral" {
  const s = selection.toLowerCase();
  if (s === "a") return "home";
  if (s === "b") return "away";
  return "neutral";
}

const VARIANT_STYLES: Record<"home" | "away" | "neutral", { base: string; selected: string; priceColor: string; badgeBg: string; badgeText: string }> = {
  home: {
    base: "bg-black border border-[var(--color-neon)]/15 hover:border-[var(--color-neon)]/70",
    selected: "border-2 border-[var(--color-neon)] bg-black shadow-[0_0_0_1px_var(--color-neon)]",
    priceColor: "text-[var(--color-neon)]",
    badgeBg: "bg-[var(--color-neon)]",
    badgeText: "text-black",
  },
  away: {
    base: "bg-black border border-[var(--color-neon)]/15 hover:border-[#fb7185]/70",
    selected: "border-2 border-[#fb7185] bg-black shadow-[0_0_0_1px_#fb7185]",
    priceColor: "text-[var(--color-neon)]",
    badgeBg: "bg-[#fb7185]",
    badgeText: "text-black",
  },
  neutral: {
    base: "bg-black border border-[var(--color-neon)]/15 hover:border-[var(--color-neon)]/70",
    selected: "border-2 border-[var(--color-neon)] bg-black shadow-[0_0_0_1px_var(--color-neon)]",
    priceColor: "text-[var(--color-neon)]",
    badgeBg: "bg-[var(--color-neon)]",
    badgeText: "text-black",
  },
};

function OddsButton({
  label, price, selected, disabled, variant, onClick,
}: {
  label: string; price: number; selected: boolean; disabled: boolean; variant: "home" | "away" | "neutral"; onClick: () => void;
}) {
  const styles = VARIANT_STYLES[variant];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={`relative flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-md px-2 py-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50 text-[var(--color-ink)] ${
        selected ? styles.selected : styles.base
      }`}
    >
      <span className="w-full whitespace-normal break-words text-center text-[12px] font-medium leading-tight">
        {label}
      </span>
      <span className={`font-display text-base font-bold tabular-nums ${styles.priceColor}`}>
        {price.toFixed(2)}x
      </span>
      {selected && (
        <span className={`absolute right-1.5 top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${styles.badgeBg} ${styles.badgeText}`}>✓</span>
      )}
    </button>
  );
}

function MarketsBoard({ markets, fight }: { markets: Market[]; fight: any }) {
  const [tab, setTab] = useState<"moneyline" | "method" | "round">("moneyline");
  const [pick, setPick] = useState<Market | null>(null);
  const [stake, setStake] = useState("10");

  const qc = useQueryClient();
  const placeFn = useServerFn(placeUfcBet);
  const mut = useMutation({
    mutationFn: (v: { stake: number; market: Market }) =>
      placeFn({ data: { fightId: fight.id, marketType: v.market.market_type, selectionKey: v.market.selection_key, stake: v.stake } }),
    onSuccess: () => {
      toast.success("Prediction locked");
      qc.invalidateQueries({ queryKey: ["ufc-fight-detail", fight.id] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      setPick(null);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to place bet"),
  });

  const filtered = markets.filter((m) => m.market_type === tab);
  const finished = fight.status === "finished";

  const stakeNum = Number(stake) || 0;
  const stakeErr =
    !Number.isFinite(stakeNum) || stakeNum < MIN_STAKE
      ? `Minimum stake is ${MIN_STAKE} points.`
      : stakeNum > MAX_STAKE
        ? `Maximum stake is ${MAX_STAKE.toLocaleString()} points.`
        : null;
  const potentialReturn = pick ? stakeNum * Number(pick.odds) : 0;
  const potentialGain = potentialReturn - stakeNum;

  return (
    <div className="pt-4 space-y-4 -mx-3 sm:-mx-2 md:mx-0">
      {/* Segmented tab bar — identical to football MarketTabs */}
      <div className="flex overflow-x-auto rounded-md border border-[var(--color-surface-border)] bg-[#070D0A] scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MARKET_TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setPick(null); }}
              className={`shrink-0 px-4 py-2.5 text-center text-[13px] font-semibold whitespace-nowrap transition-colors border-r border-[var(--color-surface-border)]/60 last:border-r-0 flex-1 ${
                active
                  ? "bg-[var(--color-neon)]/10 text-[var(--color-neon)] shadow-[inset_0_-2px_0_0_var(--color-neon)]"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="px-3 sm:px-2 md:px-0 space-y-3">
        {/* Question heading (mirrors QuestionHeading) */}
        <div className="mb-2 space-y-0.5">
          <h4 className="text-[15px] font-semibold leading-snug text-[var(--color-ink)]">
            {tab === "moneyline" && "Who wins the fight?"}
            {tab === "method" && "How does the fight end?"}
            {tab === "round" && "Which round does it end in?"}
          </h4>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-md border border-[var(--color-surface-border)] bg-[var(--surface-2)] py-6 text-center text-xs text-[var(--color-ink-muted)]">
            No {tab} odds available yet.
          </div>
        ) : (
          <div className={`grid gap-2 ${tab === "moneyline" ? "grid-cols-2" : "grid-cols-3"}`}>
            {filtered.map((m) => (
              <OddsButton
                key={`${m.market_type}:${m.selection_key}`}
                label={m.label}
                price={Number(m.odds)}
                selected={pick?.selection_key === m.selection_key && pick?.market_type === m.market_type}
                disabled={!m.is_active || finished}
                variant={classifyUfc(m.selection_key)}
                onClick={() => setPick(m)}
              />
            ))}
          </div>
        )}
      </div>


      {/* Stake slip — mirrors football StakeSlip */}
      {pick && (
        <div className="mt-2 rounded-lg border border-[var(--color-surface-border)] bg-[#070D0A] p-3.5 space-y-2.5 animate-in fade-in-50 duration-200">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-neon)]">
                Your prediction
              </div>
              <div className="truncate text-[11px] text-[var(--color-ink-muted)]">
                {fight.fighter_a} vs {fight.fighter_b}
              </div>
              <div className="text-[13px] leading-snug text-[var(--color-ink)]">
                <span className="font-semibold">{pick.label}</span>
                <span className="mx-1.5 text-[var(--color-ink-muted)]">·</span>
                <span className="font-display font-bold tabular-nums text-[var(--color-neon)]">
                  {Number(pick.odds).toFixed(2)}x
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPick(null)}
              aria-label="Clear selection"
              className="shrink-0 rounded-full p-1 text-[var(--color-ink-muted)] hover:bg-white/5 hover:text-[var(--color-ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={MIN_STAKE}
              max={MAX_STAKE}
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              placeholder={`Points (${MIN_STAKE}-${MAX_STAKE.toLocaleString()})`}
              className="flex-1 min-w-0 rounded-md border border-[var(--color-surface-border)] bg-black px-3 py-2.5 font-display text-base font-bold tabular-nums text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-neon)]"
            />
            <button
              type="button"
              disabled={mut.isPending || !!stakeErr}
              onClick={() => mut.mutate({ stake: stakeNum, market: pick })}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-[var(--color-neon)] px-4 py-2.5 text-[12px] font-bold text-black transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-[var(--color-surface-border)] disabled:text-[var(--color-ink-muted)]"
            >
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <><span>Lock Prediction</span><ArrowUpRight className="h-3.5 w-3.5" /></>
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="flex items-center justify-between rounded-md border border-[var(--color-surface-border)]/60 bg-black/40 px-2.5 py-1.5">
              <span className="text-[var(--color-ink-muted)]">Return</span>
              <span className="font-display font-bold tabular-nums text-[var(--color-ink)]">
                {potentialReturn.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-[var(--color-surface-border)]/60 bg-black/40 px-2.5 py-1.5">
              <span className="text-[var(--color-ink-muted)]">Gain</span>
              <span className="font-display font-bold tabular-nums text-[var(--color-neon)]">
                +{potentialGain.toFixed(2)}
              </span>
            </div>
          </div>

          {stakeErr && (
            <div className="text-[11px] text-destructive">{stakeErr}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Market movement — mirrors MarketAnalyticsCard framing ---------- */

function MarketMovementSection({ markets, snapshots }: { markets: Market[]; snapshots: any[] }) {
  const [tab, setTab] = useState<"moneyline" | "method" | "round">("moneyline");
  return (
    <section className="relative -mx-4 bg-[var(--surface)] md:mx-0">
      <div className="px-4 pt-5 md:px-6 md:pt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[22px] font-semibold tracking-tight text-white md:text-[26px]">
            {tab === "moneyline" ? "Who will win?" : tab === "method" ? "How does it end?" : "Which round?"}
          </h2>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            <TrendingUp className="h-3 w-3" /> Last 24h
          </span>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {MARKET_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
                tab === t.id
                  ? "border-[var(--color-neon)] bg-[var(--color-neon)]/10 text-[var(--color-neon)]"
                  : "border-[var(--color-surface-border)] bg-[var(--surface-2)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 px-4 md:px-6">
        <MovementChart snapshots={snapshots} marketType={tab} markets={markets} />
      </div>
    </section>
  );
}

function MovementChart({ snapshots, marketType, markets }: { snapshots: any[]; marketType: string; markets: Market[] }) {
  const filtered = snapshots.filter((s) => s.market_type === marketType);
  if (filtered.length === 0) {
    return <div className="py-10 text-center text-xs text-[var(--color-ink-muted)]">Movement history builds up over time — check back after a few sync cycles.</div>;
  }
  const keys = Array.from(new Set(filtered.map((s) => s.selection_key)));
  const labelFor = (k: string) => markets.find((m) => m.market_type === marketType && m.selection_key === k)?.label ?? k;
  const buckets = new Map<string, any>();
  for (const s of filtered) {
    const t = new Date(s.sampled_at).getTime();
    const bucketKey = String(Math.round(t / 60000) * 60000);
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, { t: Number(bucketKey) });
    buckets.get(bucketKey)[s.selection_key] = Number(s.odds);
  }
  const data = Array.from(buckets.values()).sort((a, b) => a.t - b.t);
  const colors = ["#22C55E", "#EC4899", "#3B82F6", "#F59E0B", "#A78BFA", "#FB7185", "#10B981", "#F97316"];
  return (
    <div className="h-56 w-full sm:h-64">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 6" stroke="#ffffff" strokeOpacity={0.15} vertical={false} />
          <XAxis dataKey="t" tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} stroke="var(--color-ink-muted)" fontSize={10} tickLine={false} />
          <YAxis stroke="var(--color-ink-muted)" fontSize={10} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--color-surface-border)", fontSize: 11 }}
            labelFormatter={(t) => new Date(t as number).toLocaleTimeString()}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {keys.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} name={labelFor(k)} stroke={colors[i % colors.length]} dot={false} strokeWidth={2} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Tale of tape ---------- */

function TaleOfTheTape({ a, b, fight }: { a: any; b: any; fight: any }) {
  const rows: Array<{ label: string; aVal: string; bVal: string }> = [
    { label: "Record", aVal: recordStr(a), bVal: recordStr(b) },
    { label: "Height", aVal: a?.height_cm ? `${a.height_cm} cm` : "—", bVal: b?.height_cm ? `${b.height_cm} cm` : "—" },
    { label: "Reach", aVal: a?.reach_cm ? `${a.reach_cm} cm` : "—", bVal: b?.reach_cm ? `${b.reach_cm} cm` : "—" },
    { label: "Stance", aVal: a?.stance ?? "—", bVal: b?.stance ?? "—" },
    { label: "Age", aVal: age(a?.dob), bVal: age(b?.dob) },
    { label: "Country", aVal: a?.country ?? "—", bVal: b?.country ?? "—" },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-[10px] font-black uppercase tracking-[0.18em]">
        <span className="min-w-0 truncate text-left text-[var(--color-neon)]">{fight.fighter_a}</span>
        <span className="shrink-0 text-center text-[var(--color-ink-muted)]">vs</span>
        <span className="min-w-0 truncate text-right">{fight.fighter_b}</span>
      </div>
      <div className="divide-y divide-[var(--color-surface-border)]/70 border border-[var(--color-surface-border)]/70 bg-[var(--color-surface)]/45">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3.5 py-2.5">
            <span className="text-right font-mono text-sm text-[var(--color-ink)]">{r.aVal}</span>
            <span className="text-center text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">{r.label}</span>
            <span className="text-left font-mono text-sm text-[var(--color-ink)]">{r.bVal}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function recordStr(f: any) {
  if (!f) return "—";
  const { record_w, record_l, record_d } = f;
  if (record_w == null && record_l == null) return "—";
  return `${record_w ?? 0}-${record_l ?? 0}${record_d ? `-${record_d}` : ""}`;
}
function age(dob?: string | null) {
  if (!dob) return "—";
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  return String(Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000)));
}

/* ---------- Live stats compare ---------- */

function LiveStatsCompare({ stats, homeName, awayName }: { stats: any[]; homeName: string; awayName: string }) {
  const a = stats.find((s) => s.fighter_slot === "a");
  const b = stats.find((s) => s.fighter_slot === "b");
  const rows: Array<{ key: string; label: string }> = [
    { key: "significant_strikes_landed", label: "Sig. strikes" },
    { key: "strikes_landed", label: "Total strikes" },
    { key: "takedowns_landed", label: "Takedowns" },
    { key: "submission_attempts", label: "Sub attempts" },
    { key: "knockdowns", label: "Knockdowns" },
    { key: "control_time_sec", label: "Control (s)" },
  ];
  if (!a && !b) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Stats will appear once the fight is live.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-[10px] font-black uppercase tracking-[0.18em]">
        <span className="min-w-0 truncate text-left text-[var(--color-neon)]">{homeName}</span>
        <span className="shrink-0 text-center text-[var(--color-ink-muted)]">vs</span>
        <span className="min-w-0 truncate text-right">{awayName}</span>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {rows.map((r) => {
          const h = a?.[r.key];
          const av = b?.[r.key];
          if (h == null && av == null) return null;
          const hv = Number(h ?? 0);
          const avv = Number(av ?? 0);
          const total = hv + avv || 1;
          const hPct = (hv / total) * 100;
          const lead = hv === avv ? null : hv > avv ? "home" : "away";
          return (
            <div key={r.key} className="border border-[var(--color-surface-border)]/70 bg-[var(--color-surface)]/45 px-3.5 py-3">
              <div className="mb-2 grid grid-cols-[56px_1fr_56px] items-baseline gap-2">
                <span className={`font-display text-xl font-black tabular-nums ${lead === "home" ? "text-[var(--color-neon)]" : "text-[var(--color-ink)]"}`}>{h ?? "—"}</span>
                <span className="text-center text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">{r.label}</span>
                <span className={`text-right font-display text-xl font-black tabular-nums ${lead === "away" ? "text-[var(--color-ink)]" : "text-[var(--color-ink)]/80"}`}>{av ?? "—"}</span>
              </div>
              <div className="flex h-2 overflow-hidden bg-[var(--color-surface-border)]/40">
                <div className="bg-[var(--color-neon)] transition-all duration-700" style={{ width: `${hPct}%` }} />
                <div className="bg-white/60 transition-all duration-700" style={{ width: `${100 - hPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
