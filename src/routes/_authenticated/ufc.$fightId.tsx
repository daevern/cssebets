import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUfcFightDetail, getUfcMarketHistory, placeUfcBet } from "@/lib/ufc.functions";
import { Loader2, X, Activity, TrendingUp, Users, History } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
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

  const [betCtx, setBetCtx] = useState<{ market: Market } | null>(null);

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
            onPick={(m) => setBetCtx({ market: m })}
          />
        )}

        <footer className="mt-6 flex items-center justify-between border-t border-[var(--color-surface-border)]/40 pt-6 text-[10px] font-medium tracking-[0.02em] text-[var(--color-ink-muted)]">
          <Link to="/ufc" className="flex items-center gap-2 hover:text-[var(--color-ink)]"><CsseLogo size={16} /></Link>
          <span>© {new Date().getFullYear()} <BrandText /></span>
        </footer>
      </div>

      {betCtx && data?.fight && (
        <BetSlip fight={data.fight as any} market={betCtx.market} onClose={() => setBetCtx(null)} />
      )}
    </div>
  );
}

function FightAnalytics({
  data,
  history,
  onPick,
}: {
  data: any;
  history: any[];
  onPick: (m: Market) => void;
}) {
  const { fight, fighterA, fighterB, markets, stats, h2h, event } = data;
  const isLive = fight.status && !["scheduled", "finished", "void"].includes(fight.status);
  const isFinished = fight.status === "finished";
  const phaseLabel = isFinished ? "Result" : isLive ? "Live" : "Pre-fight";

  return (
    <>
      <nav className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">
        <span>Sports</span>
        <span className="mx-1.5 text-white/25">›</span>
        <Link to="/ufc" className="hover:text-white/80">UFC</Link>
        <span className="mx-1.5 text-white/25">›</span>
        <span>{event?.name ?? "Fight"}</span>
      </nav>

      <FightHero fight={fight} fighterA={fighterA} fighterB={fighterB} phaseLabel={phaseLabel} isLive={isLive} isFinished={isFinished} />

      {/* Market movement (like MarketAnalyticsCard) */}
      <MarketMovementSection markets={markets} snapshots={history} />

      {/* Take a position — only before/during, hidden when finished */}
      {!isFinished && (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold tracking-tight md:text-xl">
              Take a position
            </h2>
          </div>
          <MarketsBoard markets={markets} fight={fight} onPick={onPick} />
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

/* ---------- Hero ---------- */

function FighterHeadshot({ url, name, size = 76 }: { url?: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="rounded-full border border-[var(--color-surface-border)] bg-[var(--surface-3)] object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("");
  return (
    <div
      className="grid place-items-center rounded-full border border-[var(--color-surface-border)] bg-[var(--surface-3)] text-sm font-bold text-[var(--color-ink-muted)]"
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
  fight, fighterA, fighterB, phaseLabel, isLive, isFinished,
}: {
  fight: any; fighterA: any; fighterB: any; phaseLabel: string; isLive: boolean; isFinished: boolean;
}) {
  const kickoff = new Date(fight.commence_time);
  const dateStr = kickoff.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeStr = kickoff.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const countdown = useCountdown(fight.commence_time);

  const posLabel = fight.card_position === "main" ? "Main Event" : fight.card_position === "co_main" ? "Co-Main Event" : "Fight";

  return (
    <section className="relative overflow-hidden border border-[var(--color-surface-border)] bg-gradient-to-b from-[var(--surface-2)] to-[var(--color-surface)] p-5 md:p-6">
      {isLive && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(120% 60% at 50% 0%, rgba(244,63,94,0.12), transparent 60%)" }}
        />
      )}
      <div className="relative">
        <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
          <span>
            {posLabel}
            {fight.weight_class ? ` · ${fight.weight_class}` : ""}
            {fight.is_title_fight ? " · Title" : ""}
          </span>
          <span className={isLive ? "flex items-center gap-1.5 text-rose-400" : ""}>
            {isLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />}
            {phaseLabel}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <FighterSide fighter={fighterA} name={fight.fighter_a} logo={fight.fighter_a_logo} side="left" />
          <div className="flex flex-col items-center gap-1">
            <span className="font-display text-2xl font-black tracking-tight text-[var(--color-neon)]">VS</span>
            {isFinished && fight.winner && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-ink-muted)]">
                {fight.winner === "a" ? "A wins" : fight.winner === "b" ? "B wins" : "Draw"}
              </span>
            )}
          </div>
          <FighterSide fighter={fighterB} name={fight.fighter_b} logo={fight.fighter_b_logo} side="right" />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-ink-muted)]">
          <span>{dateStr} · {timeStr}</span>
          <span>·</span>
          <span>{fight.scheduled_rounds} rounds</span>
          {countdown && !isLive && !isFinished && (
            <>
              <span>·</span>
              <span className="font-mono font-bold text-[var(--color-neon)]">{countdown}</span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function FighterSide({ fighter, name, logo, side }: { fighter: any; name: string; logo?: string | null; side: "left" | "right" }) {
  const align = side === "left" ? "items-start text-left" : "items-end text-right";
  const record = fighter ? `${fighter.record_w ?? 0}-${fighter.record_l ?? 0}${fighter.record_d ? `-${fighter.record_d}` : ""}` : "—";
  return (
    <div className={`flex flex-col ${align} gap-2`}>
      <FighterHeadshot url={logo || fighter?.photo_url} name={name} size={72} />
      <div className="min-w-0">
        <div className="truncate font-display text-[15px] font-bold tracking-tight text-[var(--color-ink)]">{name}</div>
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">{record}</div>
      </div>
    </div>
  );
}

/* ---------- Markets board ---------- */

function MarketsBoard({ markets, fight, onPick }: { markets: Market[]; fight: any; onPick: (m: Market) => void }) {
  const [tab, setTab] = useState<"moneyline" | "method" | "round">("moneyline");
  const filtered = markets.filter((m) => m.market_type === tab);
  const finished = fight.status === "finished";
  return (
    <div className="border border-[var(--color-surface-border)] bg-[var(--surface-2)]">
      <div className="flex border-b border-[var(--color-surface-border)] text-[11px]">
        {(["moneyline", "method", "round"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-3 font-bold uppercase tracking-[0.14em] transition ${
              tab === t ? "bg-[var(--surface-3)] text-[var(--color-ink)]" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            }`}
          >{t}</button>
        ))}
      </div>
      <div className="p-3">
        {filtered.length === 0 ? (
          <div className="py-6 text-center text-xs text-[var(--color-ink-muted)]">No {tab} odds available yet.</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((m) => (
              <button
                key={m.selection_key}
                disabled={!m.is_active || finished}
                onClick={() => onPick(m)}
                className="flex items-center justify-between border border-[var(--color-surface-border)] bg-[var(--color-surface)]/60 px-3 py-3 text-left transition hover:border-[var(--color-neon)]/40 hover:bg-[var(--surface-3)] disabled:opacity-50"
              >
                <span className="line-clamp-2 min-w-0 flex-1 text-xs font-medium text-[var(--color-ink)]">{m.label}</span>
                <span className="ml-2 font-mono text-base font-black text-[var(--color-neon)]">
                  {Number(m.odds).toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Market movement ---------- */

function MarketMovementSection({ markets, snapshots }: { markets: Market[]; snapshots: any[] }) {
  const [tab, setTab] = useState<"moneyline" | "method" | "round">("moneyline");
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
        <span className="flex min-w-0 items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
          <TrendingUp className="h-3 w-3" /> Market analytics
        </span>
        <span className="shrink-0 text-[10px] font-medium tracking-[0.02em] text-[var(--color-ink-muted)]">
          Last 24h
        </span>
      </div>
      <div className="border border-[var(--color-surface-border)] bg-[var(--surface-2)]">
        <div className="flex border-b border-[var(--color-surface-border)] text-[11px]">
          {(["moneyline", "method", "round"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 px-3 py-2 font-bold uppercase tracking-[0.14em] transition ${
                tab === t ? "bg-[var(--surface-3)] text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]"
              }`}
            >{t}</button>
          ))}
        </div>
        <div className="p-3">
          <MovementChart snapshots={snapshots} marketType={tab} markets={markets} />
        </div>
      </div>
    </section>
  );
}

function MovementChart({ snapshots, marketType, markets }: { snapshots: any[]; marketType: string; markets: Market[] }) {
  const filtered = snapshots.filter((s) => s.market_type === marketType);
  if (filtered.length === 0) {
    return <div className="py-8 text-center text-xs text-[var(--color-ink-muted)]">Movement history builds up over time — check back after a few sync cycles.</div>;
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
  const colors = ["#22e06b", "#fb7185", "#a3e635", "#f59e0b", "#8b5cf6", "#ec4899", "#10b981", "#f97316"];
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-border)" />
          <XAxis dataKey="t" tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} stroke="var(--color-ink-muted)" fontSize={10} />
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

/* ---------- Bet slip ---------- */

function BetSlip({ fight, market, onClose }: { fight: any; market: Market; onClose: () => void }) {
  const qc = useQueryClient();
  const placeFn = useServerFn(placeUfcBet);
  const [stake, setStake] = useState("10");
  const stakeNum = Number(stake) || 0;
  const potential = stakeNum * Number(market.odds);

  const mutation = useMutation({
    mutationFn: (v: { stake: number }) =>
      placeFn({ data: { fightId: fight.id, marketType: market.market_type, selectionKey: market.selection_key, stake: v.stake } }),
    onSuccess: () => {
      toast.success("Bet placed");
      qc.invalidateQueries({ queryKey: ["ufc-fight-detail", fight.id] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message || "Failed to place bet"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl border-t border-[var(--color-surface-border)] bg-[var(--surface-2)] p-4 text-[var(--color-ink)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-neon)]">
              {market.market_type}
            </div>
            <div className="text-sm font-bold">{market.label}</div>
            <div className="text-xs text-[var(--color-ink-muted)]">{fight.fighter_a} vs {fight.fighter_b}</div>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-[var(--color-ink-muted)]" /></button>
        </div>

        <div className="mb-2 flex items-baseline justify-between text-xs">
          <span className="text-[var(--color-ink-muted)]">Odds</span>
          <span className="font-mono text-lg font-bold text-[var(--color-neon)]">{Number(market.odds).toFixed(2)}</span>
        </div>

        <label className="block text-xs font-medium text-[var(--color-ink-muted)]">Stake</label>
        <input
          type="number" inputMode="decimal" min="1" step="1" value={stake}
          onChange={(e) => setStake(e.target.value)}
          className="mt-1 w-full border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-lg text-[var(--color-ink)] focus:border-[var(--color-neon)] focus:outline-none"
        />

        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-xs text-[var(--color-ink-muted)]">Potential payout</span>
          <span className="font-mono text-xl font-bold">${potential.toFixed(2)}</span>
        </div>

        <button
          disabled={mutation.isPending || stakeNum <= 0}
          onClick={() => mutation.mutate({ stake: stakeNum })}
          className="mt-4 w-full bg-[var(--color-neon)] px-4 py-3 text-sm font-bold uppercase tracking-[0.18em] text-[#04140A] transition hover:opacity-90 disabled:opacity-50"
        >
          {mutation.isPending ? "Placing…" : "Confirm bet"}
        </button>
      </div>
    </div>
  );
}
