import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getUfcFightDetail,
  getUfcMarketHistory,
  placeUfcBet,
} from "@/lib/ufc.functions";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/ufc/$fightId")({
  head: () => ({
    meta: [
      { title: "UFC Fight — CSSEBets" },
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
  const [chartTab, setChartTab] = useState<"moneyline" | "method" | "round">("moneyline");

  if (isLoading) {
    return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--ink-dim)]" /></div>;
  }
  if (!data?.fight) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 text-[var(--ink)]">
        <Link to="/ufc" className="text-sm text-[var(--accent)]">← Back</Link>
        <p className="mt-4 text-sm text-[var(--ink-dim)]">Fight not found.</p>
      </div>
    );
  }

  const { fight, fighterA, fighterB, markets, stats, h2h, event } = data as any;
  const isLive = fight.status && !["scheduled", "finished", "void"].includes(fight.status);

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-24 text-[var(--ink)]">
      <Link to="/ufc" className="mb-3 inline-flex items-center gap-1 text-xs text-[var(--ink-dim)] hover:text-[var(--ink)]">
        <ArrowLeft className="h-3 w-3" /> Back to card
      </Link>

      {/* Header */}
      <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">
          {fight.card_position === "main" ? "Main Event" : fight.card_position === "co_main" ? "Co-Main" : "Fight"}
          {fight.weight_class ? ` · ${fight.weight_class}` : ""}
          {fight.is_title_fight ? " · Title" : ""}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <FighterHeadshot url={fight.fighter_a_logo || fighterA?.photo_url} name={fight.fighter_a} />
          <div className="flex-1 text-center">
            <div className="text-sm font-bold">{fight.fighter_a}</div>
            <div className="my-1 text-xs text-[var(--ink-dim)]">vs</div>
            <div className="text-sm font-bold">{fight.fighter_b}</div>
          </div>
          <FighterHeadshot url={fight.fighter_b_logo || fighterB?.photo_url} name={fight.fighter_b} />
        </div>
        <div className="mt-2 text-center text-[11px] text-[var(--ink-dim)]">
          {new Date(fight.commence_time).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          {" · "}{fight.scheduled_rounds} rounds
          {event?.name ? ` · ${event.name}` : ""}
        </div>
      </div>

      {/* Live odds */}
      <OddsPanel markets={markets} fight={fight} onPick={(m) => setBetCtx({ market: m })} />

      {/* Movement chart */}
      <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">Market movement</div>
          <div className="flex gap-1">
            {(["moneyline", "method", "round"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setChartTab(t)}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  chartTab === t ? "bg-[var(--accent)] text-black" : "text-[var(--ink-dim)]"
                }`}
              >{t}</button>
            ))}
          </div>
        </div>
        <MovementChart snapshots={(history?.snapshots ?? []) as any[]} marketType={chartTab} markets={markets} />
      </div>

      {/* Tale of the tape */}
      <TaleOfTheTape a={fighterA} b={fighterB} fight={fight} />

      {/* Live fight stats */}
      {(isLive || stats.length > 0) && <LiveStats stats={stats} fight={fight} />}

      {/* H2H */}
      <H2HPanel h2h={h2h} fight={fight} />

      {betCtx && (
        <BetSlip
          fight={fight}
          market={betCtx.market}
          onClose={() => setBetCtx(null)}
        />
      )}
    </div>
  );
}

function FighterHeadshot({ url, name }: { url?: string | null; name: string }) {
  if (url) {
    return <img src={url} alt={name} className="h-16 w-16 rounded-full border border-[var(--border)] bg-[var(--surface-2)] object-cover" />;
  }
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("");
  return (
    <div className="grid h-16 w-16 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-sm font-bold text-[var(--ink-dim)]">
      {initials}
    </div>
  );
}

function OddsPanel({ markets, fight, onPick }: { markets: Market[]; fight: any; onPick: (m: Market) => void }) {
  const [tab, setTab] = useState<"moneyline" | "method" | "round">("moneyline");
  const filtered = markets.filter((m) => m.market_type === tab);
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)]">
      <div className="flex border-b border-[var(--border)] text-xs">
        {(["moneyline", "method", "round"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-2 font-semibold uppercase tracking-wide transition ${
              tab === t ? "bg-[var(--surface-3)] text-[var(--ink)]" : "text-[var(--ink-dim)] hover:text-[var(--ink)]"
            }`}
          >{t}</button>
        ))}
      </div>
      <div className="p-3">
        {filtered.length === 0 ? (
          <div className="py-4 text-center text-xs text-[var(--ink-dim)]">No {tab} odds available yet.</div>
        ) : (
          <div className={tab === "moneyline" ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-2"}>
            {filtered.map((m) => (
              <button
                key={m.selection_key}
                disabled={!m.is_active || fight.status === "finished"}
                onClick={() => onPick(m)}
                className="flex flex-col items-start rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface-3)] disabled:opacity-50"
              >
                <span className="line-clamp-2 text-xs font-medium">{m.label}</span>
                <span className="mt-1 font-mono text-base font-bold text-[var(--accent)]">{Number(m.odds).toFixed(2)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MovementChart({ snapshots, marketType, markets }: { snapshots: any[]; marketType: string; markets: Market[] }) {
  const filtered = snapshots.filter((s) => s.market_type === marketType);
  if (filtered.length === 0) {
    return <div className="py-6 text-center text-xs text-[var(--ink-dim)]">Movement history builds up over time — check back after a few sync cycles.</div>;
  }
  // Build wide-format data: one point per sampled_at with a column per selection_key
  const keys = Array.from(new Set(filtered.map((s) => s.selection_key)));
  const labelFor = (k: string) => markets.find((m) => m.market_type === marketType && m.selection_key === k)?.label ?? k;
  const buckets = new Map<string, any>();
  for (const s of filtered) {
    const t = new Date(s.sampled_at).getTime();
    // bucket to nearest minute
    const bucketKey = String(Math.round(t / 60000) * 60000);
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, { t: Number(bucketKey) });
    buckets.get(bucketKey)[s.selection_key] = Number(s.odds);
  }
  const data = Array.from(buckets.values()).sort((a, b) => a.t - b.t);
  const colors = ["#22d3ee", "#f43f5e", "#a3e635", "#f59e0b", "#8b5cf6", "#ec4899", "#10b981", "#f97316"];
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="t" tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} stroke="var(--ink-dim)" fontSize={10} />
          <YAxis stroke="var(--ink-dim)" fontSize={10} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 11 }}
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
    <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">Tale of the tape</div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-y-2 text-xs">
        <div className="text-right font-bold">{fight.fighter_a}</div>
        <div />
        <div className="text-left font-bold">{fight.fighter_b}</div>
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <div className="text-right font-mono">{r.aVal}</div>
            <div className="px-3 text-center text-[10px] uppercase text-[var(--ink-dim)]">{r.label}</div>
            <div className="text-left font-mono">{r.bVal}</div>
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

function LiveStats({ stats, fight }: { stats: any[]; fight: any }) {
  const a = stats.find((s) => s.fighter_slot === "a");
  const b = stats.find((s) => s.fighter_slot === "b");
  const rows: Array<{ label: string; k: string }> = [
    { label: "Sig. Strikes", k: "significant_strikes_landed" },
    { label: "Total Strikes", k: "strikes_landed" },
    { label: "Takedowns", k: "takedowns_landed" },
    { label: "Sub. Attempts", k: "submission_attempts" },
    { label: "Knockdowns", k: "knockdowns" },
    { label: "Control (s)", k: "control_time_sec" },
  ];
  return (
    <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Live fight stats
      </div>
      {(!a && !b) ? (
        <div className="py-3 text-center text-xs text-[var(--ink-dim)]">Stats will appear once the fight is live.</div>
      ) : (
        <div className="grid grid-cols-[1fr_auto_1fr] gap-y-2 text-xs">
          <div className="text-right font-bold">{fight.fighter_a}</div><div /><div className="text-left font-bold">{fight.fighter_b}</div>
          {rows.map((r) => (
            <div key={r.k} className="contents">
              <div className="text-right font-mono">{a?.[r.k] ?? "—"}</div>
              <div className="px-3 text-center text-[10px] uppercase text-[var(--ink-dim)]">{r.label}</div>
              <div className="text-left font-mono">{b?.[r.k] ?? "—"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function H2HPanel({ h2h, fight }: { h2h: any[]; fight: any }) {
  return (
    <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">Head to head</div>
      {h2h.length === 0 ? (
        <div className="py-3 text-center text-xs text-[var(--ink-dim)]">No prior meetings between these fighters.</div>
      ) : (
        <ul className="space-y-2 text-xs">
          {h2h.map((h) => (
            <li key={h.id} className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1">
              <span>{h.date}</span>
              <span className="font-semibold">
                {h.winner_slot === "a" ? fight.fighter_a : h.winner_slot === "b" ? fight.fighter_b : "Draw"}
              </span>
              <span className="text-[var(--ink-dim)]">{h.event_name ?? ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BetSlip({ fight, market, onClose }: { fight: any; market: Market; onClose: () => void }) {
  const qc = useQueryClient();
  const placeFn = useServerFn(placeUfcBet);
  const [stake, setStake] = useState("10");
  const stakeNum = Number(stake) || 0;
  const potential = stakeNum * market.odds;

  const mutation = useMutation({
    mutationFn: (v: { stake: number }) =>
      placeFn({ data: { fightId: fight.id, marketType: market.market_type, selectionKey: market.selection_key, stake: v.stake } }),
    onSuccess: () => {
      toast.success("Bet placed");
      qc.invalidateQueries({ queryKey: ["ufc-fight-detail", fight.id] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl border-t border-[var(--border)] bg-[var(--surface-1)] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">{market.market_type}</div>
            <div className="text-sm font-bold">{market.label}</div>
            <div className="text-xs text-[var(--ink-dim)]">{fight.fighter_a} vs {fight.fighter_b}</div>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-[var(--ink-dim)]" /></button>
        </div>
        <div className="mb-2 flex items-baseline justify-between text-xs">
          <span className="text-[var(--ink-dim)]">Odds</span>
          <span className="font-mono text-lg font-bold text-[var(--accent)]">{Number(market.odds).toFixed(2)}</span>
        </div>
        <label className="block text-xs font-medium text-[var(--ink-dim)]">Stake</label>
        <input
          type="number" inputMode="decimal" min="1" step="1" value={stake}
          onChange={(e) => setStake(e.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-mono text-lg text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none"
        />
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-xs text-[var(--ink-dim)]">Potential payout</span>
          <span className="font-mono text-xl font-bold">${potential.toFixed(2)}</span>
        </div>
        <button
          disabled={mutation.isPending || stakeNum <= 0}
          onClick={() => mutation.mutate({ stake: stakeNum })}
          className="mt-4 w-full rounded-md bg-[var(--accent)] px-4 py-3 font-bold text-black transition hover:opacity-90 disabled:opacity-50"
        >
          {mutation.isPending ? "Placing…" : "Confirm bet"}
        </button>
      </div>
    </div>
  );
}
