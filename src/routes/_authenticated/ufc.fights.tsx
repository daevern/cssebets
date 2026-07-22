import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronRight, Loader2 } from "lucide-react";
import { PageFooter } from "@/components/ui/page-footer";
import { listUfcFightsAll } from "@/lib/ufc.functions";
import { teamFlagUrl } from "@/lib/country-flags";

export const Route = createFileRoute("/_authenticated/ufc/fights")({
  head: () => ({ meta: [{ title: "UFC Fights — CSSEBets" }] }),
  component: UfcFightsPage,
});

type Market = {
  fight_id: string;
  market_type: string;
  selection_key: string;
  odds: number;
  is_active: boolean;
};

type Fight = {
  id: string;
  fighter_a: string;
  fighter_b: string;
  fighter_a_logo?: string | null;
  fighter_b_logo?: string | null;
  fighter_a_country?: string | null;
  fighter_b_country?: string | null;
  commence_time: string;
  card_position: "main" | "co_main" | "other";
  status: string;
  weight_class?: string | null;
  is_title_fight?: boolean;
  event_name?: string | null;
  markets: Market[];
};

type Tab = "live" | "upcoming" | "completed";

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

function timeChip(iso: string, status: string, now: number) {
  if (status === "live") return "LIVE";
  if (status === "finished") return "Full time";
  const d = new Date(iso);
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
  return { a: Math.round((ia / s) * 100), b: Math.round((ib / s) * 100) };
}

function FighterPortrait({ url, name, country, size = 44 }: { url?: string | null; name: string; country?: string | null; size?: number }) {
  const src = url || (country ? teamFlagUrl(country, 160) : null);
  if (src) {
    return (
      <img
        src={src}
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
      className="grid place-items-center rounded-lg border border-[var(--color-surface-border)] bg-[var(--surface-3)] text-[11px] font-bold text-[var(--color-ink)]"
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  );
}

function UfcFightsPage() {
  const listFn = useServerFn(listUfcFightsAll);
  const now = useTicker(30_000);
  const [tab, setTab] = useState<Tab>("upcoming");

  const { data, isLoading } = useQuery({
    queryKey: ["ufc-fights-all"],
    queryFn: () => listFn(),
    refetchInterval: 60_000,
  });

  const fights: Fight[] = (data?.fights as any) ?? [];

  const { live, upcoming, completed } = useMemo(() => {
    const l: Fight[] = []; const u: Fight[] = []; const c: Fight[] = [];
    for (const f of fights) {
      if (f.status === "live") { l.push(f); continue; }
      if (f.status === "finished") { c.push(f); continue; }
      u.push(f);
    }
    const asc = (a: Fight, b: Fight) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime();
    l.sort(asc); u.sort(asc);
    c.sort((a, b) => new Date(b.commence_time).getTime() - new Date(a.commence_time).getTime());
    return { live: l, upcoming: u, completed: c };
  }, [fights]);

  const list = tab === "live" ? live : tab === "upcoming" ? upcoming : completed;

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-5 overflow-x-hidden bg-[var(--surface)] px-4 pt-5 pb-24">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-[var(--color-ink-muted)]">
        <Link to="/matches" className="hover:text-[var(--color-ink)]">Sports</Link>
        <ChevronRight className="h-3 w-3 opacity-60" />
        <Link to="/ufc" className="hover:text-[var(--color-ink)]">UFC</Link>
        <ChevronRight className="h-3 w-3 opacity-60" />
        <span className="text-[var(--color-ink)]">Fights</span>
      </nav>

      <div className="grid grid-cols-3 rounded-full border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-1">
        <TabBtn active={tab === "live"} onClick={() => setTab("live")} label="Live" count={live.length} tone="live" />
        <TabBtn active={tab === "upcoming"} onClick={() => setTab("upcoming")} label="Upcoming" count={upcoming.length || undefined} />
        <TabBtn active={tab === "completed"} onClick={() => setTab("completed")} label="Completed" count={completed.length || undefined} />
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--color-neon)]" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-10 text-center text-sm text-[var(--color-ink-muted)]">
          {tab === "live" ? "No fights are live right now." : "No fights in this view."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((f) => (
            <FightCard key={f.id} fight={f} now={now} />
          ))}
        </div>
      )}

      <PageFooter />
    </div>
  );
}

function TabBtn({
  active, onClick, label, count, tone,
}: { active: boolean; onClick: () => void; label: string; count?: number; tone?: "live" }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center justify-center gap-2 rounded-full py-2 text-[13px] font-semibold tracking-tight transition-colors ${
        active ? "bg-[var(--surface-3)] text-[var(--color-ink)]" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      }`}
    >
      {tone === "live" && active && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-neon)]" />}
      <span className={tone === "live" && active ? "text-[var(--color-neon)]" : ""}>{label}</span>
      {count != null && count > 0 && (
        <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
          active ? "bg-[var(--color-neon)] text-[#04140A]" : "bg-[var(--surface-3)] text-[var(--color-ink-muted)]"
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

function FightCard({ fight, now }: { fight: Fight; now: number }) {
  const live = fight.status === "live";
  const pct = moneylinePct(fight.markets);
  return (
    <Link
      to="/ufc/$fightId"
      params={{ fightId: fight.id }}
      className={`group relative block overflow-hidden rounded-2xl border bg-[var(--surface-2)] transition-colors ${
        live ? "border-rose-500/50 hover:border-rose-500/70" : "border-[var(--color-surface-border)] hover:border-[var(--color-neon)]/30"
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
          <span className={live ? "flex items-center gap-1.5 text-rose-400" : "text-[var(--color-ink-muted)]"}>
            {live && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
              </span>
            )}
            {timeChip(fight.commence_time, fight.status, now)}
          </span>
          <span className="uppercase tracking-wider text-[var(--color-ink-muted)]">
            {fight.card_position === "main" ? "Main" : fight.card_position === "co_main" ? "Co-Main" : "Card"}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <FighterPortrait url={fight.fighter_a_logo} country={fight.fighter_a_country} name={fight.fighter_a} size={44} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[15px] font-bold tracking-tight text-[var(--color-ink)]">
              {fight.fighter_a} <span className="text-[var(--color-ink-muted)]">vs</span> {lastName(fight.fighter_b)}
            </div>
            <div className="truncate text-[11px] text-[var(--color-ink-muted)]">
              {fight.event_name ?? "UFC"}{fight.weight_class ? ` · ${fight.weight_class}` : ""}{fight.is_title_fight ? " · Title" : ""}
            </div>
          </div>
          <FighterPortrait url={fight.fighter_b_logo} country={fight.fighter_b_country} name={fight.fighter_b} size={44} />
        </div>

        {pct && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="rounded-full border border-rose-400/40 px-2.5 py-0.5 text-[12px] font-bold tabular-nums text-rose-400">
              {lastName(fight.fighter_a)} {pct.a}%
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
              <div className="h-full bg-rose-400/70" style={{ width: `${pct.a}%` }} />
            </div>
            <span className="rounded-full border border-[var(--color-neon)]/40 px-2.5 py-0.5 text-[12px] font-bold tabular-nums text-[var(--color-neon)]">
              {pct.b}% {lastName(fight.fighter_b)}
            </span>
          </div>
        )}

        <div
          className={`mt-4 flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold tracking-tight transition-transform ${
            live
              ? "bg-rose-500 text-[#160406] group-hover:translate-y-[-1px]"
              : "border border-[var(--color-surface-border)] text-[var(--color-neon)] group-hover:border-[var(--color-neon)]/40"
          }`}
        >
          Open Market <ArrowUpRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}
