import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useMemo } from "react";
import {
  ArrowUpRight,
  Ticket,
  Loader2,
  TrendingUp,
  Lock,
  CircleDot,
} from "lucide-react";
import { listStoreItems, purchaseFreeBet, listMyFreeBets } from "@/lib/freebets.functions";
import { getMyEngagementSummary } from "@/lib/engagement.functions";

export const Route = createFileRoute("/_authenticated/store")({
  component: StorePage,
});

type StoreItem = {
  id: string;
  item_key: string;
  kind: string;
  label: string | null;
  stake_amount: number;
  token_price: number;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown> | null;
};

function StorePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listFn = useServerFn(listStoreItems);
  const summaryFn = useServerFn(getMyEngagementSummary);
  const myFbFn = useServerFn(listMyFreeBets);
  const buyFn = useServerFn(purchaseFreeBet);

  const items = useQuery({ queryKey: ["store-items"], queryFn: () => listFn() });
  const summary = useQuery({ queryKey: ["engagement-summary"], queryFn: () => summaryFn() });
  const myFbs = useQuery({ queryKey: ["my-free-bets"], queryFn: () => myFbFn() });

  const buy = useMutation({
    mutationFn: (itemKey: string) => buyFn({ data: { itemKey } }),
    onSuccess: () => {
      toast.success("Free bet added to your locker.");
      qc.invalidateQueries({ queryKey: ["engagement-summary"] });
      qc.invalidateQueries({ queryKey: ["my-free-bets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const balance = summary.data?.tokens.balance ?? 0;
  const list: StoreItem[] = (items.data ?? []) as StoreItem[];

  // Best-value = highest stake per CSSE spent.
  const sorted = useMemo(
    () => [...list].sort((a, b) => Number(a.token_price) - Number(b.token_price)),
    [list],
  );
  const featured = useMemo(() => {
    if (list.length === 0) return null;
    return [...list].sort(
      (a, b) => Number(b.stake_amount) / Number(b.token_price) - Number(a.stake_amount) / Number(a.token_price),
    )[0];
  }, [list]);

  const available = myFbs.data?.available ?? [];
  const history = (myFbs.data?.all ?? []).filter((f: any) => f.status !== "available");

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 pb-24 pt-4 text-[var(--color-ink)]">
      {/* Header row — orderbook style */}
      <header className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-neon)]">
            Store · Free bet market
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold leading-tight">
            Convert CSSE into stake.
          </h1>
          <p className="mt-0.5 text-[12px] text-[var(--color-ink-muted)]">
            Stake is funded by the house. You keep profit only.
          </p>
        </div>
        <div className="shrink-0 rounded-md border border-[var(--color-surface-border)] bg-black/40 px-3 py-2 text-right">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
            Balance
          </div>
          <div className="mt-0.5 font-display text-lg font-bold tabular-nums text-[var(--color-neon)]">
            {balance.toLocaleString()}
          </div>
        </div>
      </header>

      {/* Featured — highest stake per CSSE */}
      {featured && (
        <FeaturedCard
          item={featured}
          balance={balance}
          pending={buy.isPending && buy.variables === featured.item_key}
          onBuy={() => buy.mutate(featured.item_key)}
        />
      )}

      {/* Orderbook of free-bet tiers */}
      <section className="rounded-lg border border-[var(--color-surface-border)] bg-[#070D0A]">
        <div className="flex items-center justify-between border-b border-[var(--color-surface-border)]/60 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
            All tiers
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)] tabular-nums">
            {list.length} listed
          </div>
        </div>

        {/* Column header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-b border-[var(--color-surface-border)]/40 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
          <span>Stake</span>
          <span className="text-right">Rate</span>
          <span className="text-right">Cost</span>
          <span className="text-right pl-2">Action</span>
        </div>

        {items.isLoading && (
          <div className="px-3 py-8 text-center text-xs text-[var(--color-ink-muted)]">
            Loading tiers…
          </div>
        )}
        {!items.isLoading && list.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-[var(--color-ink-muted)]">
            Store closed. Check back soon.
          </div>
        )}

        <ul className="divide-y divide-[var(--color-surface-border)]/40">
          {sorted.map((it) => {
            const stake = Number(it.stake_amount);
            const price = Number(it.token_price);
            const rate = price > 0 ? stake / price : 0;
            const short = balance < price;
            const pending = buy.isPending && buy.variables === it.item_key;
            const isFeatured = featured?.item_key === it.item_key;
            return (
              <li
                key={it.id}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-2.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border ${
                      isFeatured
                        ? "border-[var(--color-neon)]/70 bg-[var(--color-neon)]/10 text-[var(--color-neon)]"
                        : "border-[var(--color-surface-border)] text-[var(--color-ink-muted)]"
                    }`}
                  >
                    <Ticket className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-display text-[15px] font-bold leading-none tabular-nums">
                      {stake.toLocaleString()}
                      <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
                        pts
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
                      {it.label || "Free bet"}
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono text-[11px] text-[var(--color-ink-muted)] tabular-nums">
                  {rate.toFixed(2)}×
                </div>
                <div className="text-right font-display text-[13px] font-bold tabular-nums text-[var(--color-ink)]">
                  {price.toLocaleString()}
                  <span className="ml-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
                    CSSE
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => buy.mutate(it.item_key)}
                  disabled={short || pending}
                  title={short ? `Need ${(price - balance).toLocaleString()} more CSSE` : undefined}
                  className={`ml-2 flex h-8 min-w-[68px] items-center justify-center gap-1 rounded-md px-2 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
                    short
                      ? "cursor-not-allowed border border-[var(--color-surface-border)] text-[var(--color-ink-muted)]"
                      : "bg-[var(--color-neon)] text-black hover:brightness-110 disabled:opacity-60"
                  }`}
                >
                  {pending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : short ? (
                    <>
                      <Lock className="h-3 w-3" />
                      Locked
                    </>
                  ) : (
                    "Buy"
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-[var(--color-surface-border)]/60 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          Need more CSSE?{" "}
          <Link to="/referrals" className="text-[var(--color-neon)] hover:underline">
            Invite friends →
          </Link>
        </div>
      </section>

      {/* Locker — user's open free bets */}
      <section className="rounded-lg border border-[var(--color-surface-border)] bg-[#070D0A]">
        <div className="flex items-center justify-between border-b border-[var(--color-surface-border)]/60 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
              Your locker
            </div>
            {available.length > 0 && (
              <span className="rounded-full bg-[var(--color-neon)]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--color-neon)]">
                {available.length} ready
              </span>
            )}
          </div>
          <Link
            to="/free-bets/place"
            className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-neon)] hover:underline"
          >
            Place <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>

        {available.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-[var(--color-ink-muted)]">
            No available free bets. Buy a tier above.
          </div>
        )}

        <ul className="divide-y divide-[var(--color-surface-border)]/40">
          {available.map((f: any) => (
            <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <CircleDot className="h-3.5 w-3.5 shrink-0 text-[var(--color-neon)]" />
                <div>
                  <div className="font-display text-[14px] font-bold leading-none tabular-nums">
                    {Number(f.stake_amount).toLocaleString()}
                    <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
                      pts
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
                    Bought {new Date(f.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate({ to: "/free-bets/place", search: { fb: f.id } as any })}
                className="flex items-center gap-1 rounded-md bg-[var(--color-neon)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-black hover:brightness-110"
              >
                Use <ArrowUpRight className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>

        {history.length > 0 && (
          <>
            <div className="border-t border-[var(--color-surface-border)]/60 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
              History
            </div>
            <ul className="divide-y divide-[var(--color-surface-border)]/30">
              {history.slice(0, 8).map((f: any) => {
                const won = f.settled_outcome === "won";
                const lost = f.settled_outcome === "lost";
                return (
                  <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 opacity-80">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          won ? "bg-[var(--color-neon)]" : lost ? "bg-destructive" : "bg-[var(--color-ink-muted)]/50"
                        }`}
                      />
                      <span className="font-display text-[13px] font-bold tabular-nums">
                        {Number(f.stake_amount).toLocaleString()} pts
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
                      {f.status} · {f.settled_outcome ?? "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function FeaturedCard({
  item,
  balance,
  pending,
  onBuy,
}: {
  item: StoreItem;
  balance: number;
  pending: boolean;
  onBuy: () => void;
}) {
  const stake = Number(item.stake_amount);
  const price = Number(item.token_price);
  const rate = price > 0 ? stake / price : 0;
  const short = balance < price;
  const shortage = short ? price - balance : 0;

  return (
    <article className="relative overflow-hidden rounded-lg border border-[var(--color-neon)]/40 bg-[#070D0A] p-4">
      {/* Subtle diagonal ticker background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, var(--color-neon) 0 1px, transparent 1px 12px)",
        }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-neon)]/40 bg-black/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-neon)]">
            <TrendingUp className="h-3 w-3" /> Best value
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-[38px] font-bold leading-none tabular-nums text-[var(--color-ink)]">
              {stake.toLocaleString()}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
              pts free
            </span>
          </div>
          <div className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
            <span className="tabular-nums text-[var(--color-ink)]">{rate.toFixed(2)}×</span> stake per CSSE spent
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
            Cost
          </div>
          <div className="mt-0.5 font-display text-[22px] font-bold tabular-nums text-[var(--color-neon)]">
            {price.toLocaleString()}
          </div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
            CSSE
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onBuy}
        disabled={short || pending}
        className={`relative mt-4 flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-[12px] font-bold uppercase tracking-[0.14em] transition-colors ${
          short
            ? "cursor-not-allowed border border-[var(--color-surface-border)] text-[var(--color-ink-muted)]"
            : "bg-[var(--color-neon)] text-black hover:brightness-110"
        }`}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : short ? (
          <>
            <Lock className="h-3.5 w-3.5" />
            Need {shortage.toLocaleString()} more CSSE
          </>
        ) : (
          <>
            Buy for {price.toLocaleString()} CSSE
            <ArrowUpRight className="h-3.5 w-3.5" />
          </>
        )}
      </button>
    </article>
  );
}
