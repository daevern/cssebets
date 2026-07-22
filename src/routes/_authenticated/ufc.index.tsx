import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listUfcFights } from "@/lib/ufc.functions";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { PageFooter } from "@/components/ui/page-footer";
import { teamFlagUrl } from "@/lib/country-flags";

export const Route = createFileRoute("/_authenticated/ufc/")({
  component: UfcPage,
});

type Market = {
  fight_id: string;
  market_type: "moneyline" | "three_way" | "method" | "round" | "total_rounds" | "distance" | "handicap";
  selection_key: string;
  label: string;
  odds: number;
  is_active: boolean;
  updated_at: string;
};

type Fight = {
  id: string;
  fighter_a: string;
  fighter_b: string;
  fighter_a_logo?: string | null;
  fighter_b_logo?: string | null;
  commence_time: string;
  card_position: "main" | "co_main" | "other";
  scheduled_rounds: 3 | 5;
  status: string;
  weight_class?: string | null;
  is_title_fight?: boolean;
  markets: Market[];
};

function useTicker(ms = 30_000) {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

function lastName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

function statusLabel(f: Fight, now: number) {
  if (f.status === "live") return "LIVE";
  if (f.status === "finished") return "Full time";
  const d = new Date(f.commence_time);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const h = d.getHours() % 12 || 12;
  const t = `${h}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
  return sameDay ? `Today · ${t}` : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${t}`;
}

function moneylinePct(markets: Market[]) {
  const a = markets.find((m) => m.market_type === "moneyline" && m.selection_key === "a");
  const b = markets.find((m) => m.market_type === "moneyline" && m.selection_key === "b");
  if (!a || !b) return null;
  const ia = 1 / Number(a.odds);
  const ib = 1 / Number(b.odds);
  const s = ia + ib;
  return { a: Math.round((ia / s) * 100), b: Math.round((ib / s) * 100), oddsA: Number(a.odds), oddsB: Number(b.odds) };
}

/* Fighter portrait — the visual equivalent of TeamFlag on the football side. */
function FighterPortrait({ url, name, size = 56 }: { url?: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--surface-3)] object-cover"
        style={{ width: size, height: size }}
        loading="lazy"
      />
    );
  }
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("");
  return (
    <div
      className="grid place-items-center rounded-lg border border-[var(--color-surface-border)] bg-[var(--surface-3)] text-[11px] font-bold text-[var(--ink)]"
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  );
}

function UfcPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listUfcFights);
  const now = useTicker(30_000);

  const { data, isLoading } = useQuery({
    queryKey: ["ufc-fights"],
    queryFn: () => listFn(),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("ufc-markets")
      .on("postgres_changes", { event: "*", schema: "public", table: "ufc_fight_markets" }, () => {
        qc.invalidateQueries({ queryKey: ["ufc-fights"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const fights = ((data?.fights as unknown as Fight[]) ?? []).slice();
  fights.sort((a, b) => {
    if (a.card_position === b.card_position) return new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime();
    return a.card_position === "main" ? -1 : b.card_position === "main" ? 1 : 0;
  });

  const { featured, upcoming } = useMemo(() => {
    const main = fights.find((f) => f.card_position === "main") ?? null;
    const rest = fights.filter((f) => f.id !== main?.id && f.status !== "finished");
    return { featured: main, upcoming: rest };
  }, [fights]);


  if (isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--neon)]" />
      </div>
    );
  }

  if (!data?.event) {
    return (
      <div className="flex flex-col gap-8 px-4 pt-5 pb-24 text-[var(--ink)]">
        <header>
          <h1 className="font-display text-[28px] font-bold leading-[1.05] tracking-tight text-[var(--ink)] md:text-4xl">
            UFC <span className="text-[var(--neon)]">Fight Night</span>
          </h1>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">No UFC event is currently active.</p>
        </header>
        <PageFooter />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 px-4 pt-5 pb-24 text-[var(--ink)]">
      <header className="space-y-3">
        <h1 className="font-display text-[28px] font-bold leading-[1.05] tracking-tight text-[var(--ink)] md:text-4xl">
          {data.event.name}
        </h1>
      </header>

      {upcoming.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-[var(--ink)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon)]" />
                Upcoming Fights
              </h2>
            </div>
          </div>

          <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {upcoming.map((f) => (
              <FightChip key={f.id} fight={f} now={now} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-[var(--ink)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon)]" />
              Next Fight
            </h2>
          </div>
        </div>
        {featured ? (
          <FeaturedFightCard fight={featured} now={now} eventName={data.event.name} />
        ) : (
          <div className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-10 text-center text-sm text-[var(--ink-muted)]">
            Card is being finalised — check back closer to walk-outs.
          </div>
        )}
      </section>

      <PageFooter />
    </div>
  );
}

/* ------ Trending chip — mirrors football TrendingChip layout ------ */
function FightChip({ fight, now }: { fight: Fight; now: number }) {
  const live = fight.status === "live";
  const pct = moneylinePct(fight.markets);
  return (
    <Link
      to="/ufc/$fightId"
      params={{ fightId: fight.id }}
      className={`shrink-0 rounded-xl border bg-[var(--surface-2)] px-3 py-3 transition-colors ${
        live ? "border-rose-500/50 hover:border-rose-500/70" : "border-[var(--color-surface-border)] hover:border-[var(--neon)]/50"
      }`}
      style={{ width: 172 }}
    >
      <div className="flex items-center gap-1.5">
        <FighterPortrait url={fight.fighter_a_logo} name={fight.fighter_a} size={30} />
        <span className="text-[10px] font-bold text-[var(--ink-muted)]">·</span>
        <FighterPortrait url={fight.fighter_b_logo} name={fight.fighter_b} size={30} />
      </div>
      <div className="mt-2 text-[12px] font-bold tracking-tight text-[var(--ink)]">
        {lastName(fight.fighter_a)} vs {lastName(fight.fighter_b)}
      </div>
      {live ? (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-rose-400">
          <span className="h-1 w-1 animate-pulse rounded-full bg-rose-500" /> LIVE
        </div>
      ) : (
        <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          {statusLabel(fight, now)}
        </div>
      )}
      {pct ? (
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-md border border-[var(--color-surface-border)] bg-[var(--surface-3)]/60 p-1 text-center">
          <div>
            <div className="text-[8px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">{lastName(fight.fighter_a).slice(0, 4).toUpperCase()}</div>
            <div className="text-[11px] font-bold tabular-nums text-rose-400">{pct.a}%</div>
          </div>
          <div className="border-l border-[var(--color-surface-border)]">
            <div className="text-[8px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">{lastName(fight.fighter_b).slice(0, 4).toUpperCase()}</div>
            <div className="text-[11px] font-bold tabular-nums text-[var(--neon)]">{pct.b}%</div>
          </div>
        </div>
      ) : null}
    </Link>
  );
}

/* ------ Featured card — mirrors football FeaturedMarketCard layout ------ */
function FeaturedFightCard({ fight, now, eventName }: { fight: Fight; now: number; eventName: string }) {
  const live = fight.status === "live";
  const pct = moneylinePct(fight.markets);

  return (
    <Link
      to="/ufc/$fightId"
      params={{ fightId: fight.id }}
      className={`group relative block overflow-hidden rounded-2xl border bg-[var(--surface-2)] transition-colors ${
        live
          ? "border-rose-500/50 hover:border-rose-500/70"
          : "border-[var(--color-surface-border)] hover:border-[var(--neon)]/40"
      }`}
    >
      {live && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(100% 60% at 50% 0%, rgba(244,63,94,0.10), transparent 60%)" }}
        />
      )}

      <div className="relative p-4">
        <div className="flex items-center justify-between text-[11px] font-semibold">
          <span className={live ? "flex items-center gap-1.5 text-rose-400" : "text-[var(--ink-muted)]"}>
            {live && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
              </span>
            )}
            {statusLabel(fight, now)}
          </span>
          <span className="text-[var(--ink-muted)]">{eventName}</span>
        </div>

        <div className="mt-3 flex flex-col gap-2.5">
          <FighterRow
            name={fight.fighter_a}
            logo={fight.fighter_a_logo}
            pct={pct?.a ?? null}
            mult={pct?.oddsA ?? null}
            tone="home"
          />
          <FighterRow
            name={fight.fighter_b}
            logo={fight.fighter_b_logo}
            pct={pct?.b ?? null}
            mult={pct?.oddsB ?? null}
            tone="away"
          />
        </div>

        <div
          className={`mt-4 flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold tracking-tight transition-transform ${
            live
              ? "bg-rose-500 text-[#160406] group-hover:translate-y-[-1px]"
              : "border border-[var(--neon)]/50 bg-[var(--neon)]/5 text-[var(--neon)] group-hover:translate-y-[-1px] group-hover:bg-[var(--neon)]/10"
          }`}
        >
          Open Market <ArrowUpRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}

function FighterRow({
  name, logo, pct, mult, tone,
}: {
  name: string; logo?: string | null; pct: number | null; mult: number | null; tone: "home" | "away";
}) {
  const color = tone === "home" ? "text-rose-400" : "text-[var(--neon)]";
  const borderColor = tone === "home" ? "border-rose-400/40" : "border-[var(--neon)]/40";
  const barColor = tone === "home" ? "bg-rose-400" : "bg-[var(--neon)]";
  const barGlow = tone === "home" ? "shadow-[0_0_6px_rgba(251,113,133,0.55)]" : "shadow-[0_0_6px_rgba(34,224,107,0.55)]";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <FighterPortrait url={logo} name={name} size={44} />
        <span className="truncate text-[15px] font-bold tracking-tight text-[var(--ink)]">{name}</span>
      </div>
      {pct != null && (
        <div className="hidden sm:block h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-[var(--surface-3)]">
          <div
            className={`h-full rounded-full ${barColor} ${barGlow} transition-[width] duration-500`}
            style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
          />
        </div>
      )}
      {pct != null && (
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-2">
            <div className="sm:hidden h-1.5 w-14 overflow-hidden rounded-full bg-[var(--surface-3)]">
              <div
                className={`h-full rounded-full ${barColor} ${barGlow} transition-[width] duration-500`}
                style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
              />
            </div>
            <span className={`rounded-full border ${borderColor} px-3 py-1 text-[13px] font-bold tabular-nums ${color}`}>
              {pct}%
            </span>
          </div>
          {mult != null && (
            <span className="mt-0.5 text-[10px] tabular-nums text-[var(--ink-muted)]">{mult.toFixed(2)}x</span>
          )}
        </div>
      )}
    </div>
  );
}
