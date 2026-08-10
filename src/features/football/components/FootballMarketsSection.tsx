import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getFootballMatch,
  listMyFootballOpenBetsForEvent,
} from "../football.functions";
import { FootballMarketCard } from "./FootballMarketCard";
import { FootballBetSlip } from "./FootballBetSlip";
import type { FootballMarket, FootballSelection } from "../types/football";

const CATEGORY_ORDER = [
  "Match",
  "Goals",
  "Halves",
  "Teams",
  "Corners",
  "Cards",
  "Specials",
  "Popular",
];

/** Betting surface for a club-football fixture — the "Take a position"
 *  section rendered inside the shared match analytics screen. */
export function FootballMarketsSection({ matchId }: { matchId: string }) {
  const fetcher = useServerFn(getFootballMatch);
  const { data, isLoading } = useQuery({
    queryKey: ["football-match", matchId],
    queryFn: () => fetcher({ data: { matchId } }),
    refetchInterval: 15_000,
  });

  const openBetsFetcher = useServerFn(listMyFootballOpenBetsForEvent);
  const openBetsQ = useQuery({
    queryKey: ["football-my-bets", matchId],
    queryFn: () => openBetsFetcher({ data: { eventId: matchId } }),
    refetchInterval: 30_000,
  });
  const openBetKeys = useMemo(() => {
    const set = new Set<string>();
    for (const b of openBetsQ.data?.openSelections ?? []) {
      set.add(`${b.marketId}::${b.selectionKey}`);
    }
    return set;
  }, [openBetsQ.data]);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [pick, setPick] = useState<{
    marketId: string;
    selection: FootballSelection;
  } | null>(null);
  const lastPickRef = useRef<{
    marketId: string;
    selection: FootballSelection;
  } | null>(null);

  const categories = useMemo(() => {
    if (!data) return [] as string[];
    const set = new Set<string>();
    for (const m of data.markets) set.add(m.category);
    return Array.from(set).sort(
      (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b),
    );
  }, [data]);

  const filteredMarkets: FootballMarket[] = useMemo(() => {
    if (!data) return [];
    if (!activeCategory) return data.markets;
    return data.markets.filter((m) => m.category === activeCategory);
  }, [data, activeCategory]);

  if (isLoading) {
    return (
      <div className="h-32 animate-pulse rounded-xl bg-[var(--color-surface)]/40" />
    );
  }
  if (!data) return null;

  const isClosed = ["finished", "postponed", "cancelled", "abandoned"].includes(
    data.match.status,
  );

  return (
    <div>
      {isClosed && (
        <div className="mb-3 rounded-xl border border-[var(--color-surface-border)]/70 bg-[var(--color-surface)]/40 p-4 text-sm text-[var(--color-ink-muted)]">
          Betting is closed on this match.{" "}
          {data.match.status === "finished" ? "Awaiting settlement." : ""}
        </div>
      )}

      {categories.length > 0 && (
        <nav
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
          aria-label="Market categories"
        >
          <CategoryChip
            label="All"
            active={activeCategory === null}
            onClick={() => setActiveCategory(null)}
          />
          {categories.map((c) => (
            <CategoryChip
              key={c}
              label={c}
              active={activeCategory === c}
              onClick={() => setActiveCategory(c)}
            />
          ))}
        </nav>
      )}

      <div className="mt-4 space-y-3">
        {filteredMarkets.length === 0 ? (
          <div className="rounded-xl border border-[var(--color-surface-border)]/70 bg-[var(--color-surface)]/40 p-4 text-sm text-[var(--color-ink-muted)]">
            No markets available yet. Odds appear once bookmakers publish prices.
          </div>
        ) : (
          filteredMarkets.map((m) => (
            <FootballMarketCard
              key={m.id}
              market={m}
              onSelect={(marketId, selection) => setPick({ marketId, selection })}
              selectedSelectionId={pick?.selection.id ?? null}
              openBetKeys={openBetKeys}
            />
          ))
        )}
      </div>

      {(() => {
        const stickyPick = pick ?? lastPickRef.current;
        if (pick) lastPickRef.current = pick;
        if (!stickyPick) return null;
        return (
          <FootballBetSlip
            eventId={data.match.id}
            marketId={stickyPick.marketId}
            selection={stickyPick.selection}
            onClose={() => setPick(null)}
            open={!!pick && !isClosed}
          />
        );
      })()}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 shrink-0 snap-start rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "bg-[var(--color-neon)] text-black"
          : "bg-white/5 text-[var(--color-ink-muted)] hover:bg-white/10 active:bg-white/15"
      }`}
    >
      {label}
    </button>
  );
}
