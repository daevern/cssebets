import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFootballMatch } from "../football.functions";
import { FootballMatchHeader } from "../components/FootballMatchHeader";
import { FootballMarketCard } from "../components/FootballMarketCard";
import { FootballBetSlip } from "../components/FootballBetSlip";
import type { FootballMarket, FootballSelection } from "../types/football";

const CATEGORY_ORDER = ["Match", "Goals", "Halves", "Teams", "Corners", "Cards", "Specials", "Popular"];

export function FootballMatchDetailsPage({ matchId }: { matchId: string }) {
  const fetcher = useServerFn(getFootballMatch);
  const { data, isLoading, error } = useQuery({
    queryKey: ["football-match", matchId],
    queryFn: () => fetcher({ data: { matchId } }),
    refetchInterval: 15_000,
  });

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [pick, setPick] = useState<{ marketId: string; selection: FootballSelection } | null>(null);

  const categories = useMemo(() => {
    if (!data) return [] as string[];
    const set = new Set<string>();
    for (const m of data.markets) set.add(m.category);
    const list = Array.from(set);
    return list.sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));
  }, [data]);

  const filteredMarkets: FootballMarket[] = useMemo(() => {
    if (!data) return [];
    if (!activeCategory) return data.markets;
    return data.markets.filter((m) => m.category === activeCategory);
  }, [data, activeCategory]);

  if (isLoading) return <div className="p-6 text-[var(--ink-muted)]">Loading match…</div>;
  if (error || !data) return <div className="p-6 text-red-400">Could not load this match.</div>;

  const isClosed = ["finished", "postponed", "cancelled", "abandoned"].includes(data.match.status);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-40">
      <FootballMatchHeader match={data.match} />

      {isClosed ? (
        <div className="mt-4 rounded-xl border border-[var(--color-surface-border)]/70 bg-[var(--surface)]/40 p-4 text-sm text-[var(--ink-muted)]">
          Betting is closed on this match. {data.match.status === "finished" ? "Awaiting settlement." : ""}
        </div>
      ) : null}

      {categories.length > 0 && (
        <nav className="mt-6 -mx-4 px-4 overflow-x-auto flex gap-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <CategoryChip label="All" active={activeCategory === null} onClick={() => setActiveCategory(null)} />
          {categories.map((c) => (
            <CategoryChip key={c} label={c} active={activeCategory === c} onClick={() => setActiveCategory(c)} />
          ))}
        </nav>
      )}

      <div className="mt-4 space-y-3">
        {filteredMarkets.length === 0 ? (
          <div className="rounded-xl border border-[var(--color-surface-border)]/70 bg-[var(--surface)]/40 p-4 text-sm text-[var(--ink-muted)]">
            No markets available yet. Odds appear once bookmakers publish prices.
          </div>
        ) : (
          filteredMarkets.map((m) => (
            <FootballMarketCard
              key={m.id}
              market={m}
              onSelect={(marketId, selection) => setPick({ marketId, selection })}
              selectedSelectionId={pick?.selection.id ?? null}
            />
          ))
        )}
      </div>

      {pick && !isClosed ? (
        <FootballBetSlip
          eventId={data.match.id}
          marketId={pick.marketId}
          selection={pick.selection}
          onClose={() => setPick(null)}
        />
      ) : null}
    </div>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
        active ? "bg-[var(--neon)] text-black" : "bg-white/5 text-[var(--ink-muted)] hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}
