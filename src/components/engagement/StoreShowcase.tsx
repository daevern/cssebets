import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowUpRight, Ticket, Lock } from "lucide-react";
import { listStoreItems, purchaseFreeBet, listMyFreeBets } from "@/lib/freebets.functions";
import { getMyEngagementSummary } from "@/lib/engagement.functions";

/**
 * Compact custom store rail for the home page.
 * Shows the CSSE balance, three or four free-bet tiers as horizontally
 * scrolling "tickets", and lets the user buy without leaving home.
 */
export function StoreShowcase() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listFn = useServerFn(listStoreItems);
  const summaryFn = useServerFn(getMyEngagementSummary);
  const buyFn = useServerFn(purchaseFreeBet);
  const myFbFn = useServerFn(listMyFreeBets);

  const items = useQuery({ queryKey: ["store-items"], queryFn: () => listFn() });
  const summary = useQuery({ queryKey: ["engagement-summary"], queryFn: () => summaryFn(), staleTime: 30_000 });
  const myFb = useQuery({ queryKey: ["my-free-bets"], queryFn: () => myFbFn(), staleTime: 30_000 });

  const balance = summary.data?.tokens.balance ?? 0;
  const availableFb = myFb.data?.available?.length ?? 0;

  const buy = useMutation({
    mutationFn: (itemKey: string) => buyFn({ data: { itemKey } }),
    onSuccess: () => {
      toast.success("Free bet added — go place it.");
      qc.invalidateQueries({ queryKey: ["engagement-summary"] });
      qc.invalidateQueries({ queryKey: ["my-free-bets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list: any[] = items.data ?? [];

  return (
    <section
      aria-labelledby="store-heading"
      className="relative overflow-hidden rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)]"
    >
      {/* Corner brackets */}
      <span aria-hidden className="pointer-events-none absolute top-2.5 left-2.5 h-2.5 w-2.5 border-t border-l border-[var(--neon)]/60" />
      <span aria-hidden className="pointer-events-none absolute top-2.5 right-2.5 h-2.5 w-2.5 border-t border-r border-[var(--neon)]/60" />

      {/* Header */}
      <div className="flex items-end justify-between gap-2 px-4 pt-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--neon)]">
            CSSE Store
          </div>
          <h2 id="store-heading" className="mt-1 font-display text-xl font-black leading-tight text-[var(--ink)]">
            Turn tokens into <span className="text-[var(--neon)]">free bets</span>.
          </h2>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--ink-muted)]">Balance</div>
          <div className="font-display text-lg font-black tabular-nums text-[var(--neon)]">
            {balance.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Rail of tickets */}
      <div className="mt-3 -mx-0.5 overflow-x-auto px-4 pb-4 [scrollbar-width:none] [-ms-overflow-style:none]">
        <div className="flex gap-2.5 pr-1 snap-x snap-mandatory">
          {items.isLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 w-40 shrink-0 animate-pulse rounded-xl border border-[var(--color-surface-border)] bg-[#070D0A]" />
            ))}
          {list.map((it) => {
            const short = balance < it.token_price;
            return (
              <FreeBetTicket
                key={it.id}
                stake={Number(it.stake_amount)}
                price={Number(it.token_price)}
                short={short}
                pending={buy.isPending}
                onBuy={() => buy.mutate(it.item_key)}
              />
            );
          })}
          {!items.isLoading && list.length === 0 && (
            <div className="w-full py-8 text-center text-xs text-[var(--ink-muted)]">
              Store closed. Check back soon.
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-2 border-t border-dashed border-[var(--color-surface-border)] px-4 py-2.5">
        {availableFb > 0 ? (
          <button
            type="button"
            onClick={() => navigate({ to: "/free-bets/place" })}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--neon)]/50 bg-[var(--neon)]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--neon)] hover:bg-[var(--neon)]/15"
          >
            <Ticket className="h-3 w-3" />
            {availableFb} ready — place now
          </button>
        ) : (
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--ink-muted)]">
            Profit only · Stake refunded to house
          </span>
        )}
        <Link
          to="/store"
          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ink)] hover:text-[var(--neon)]"
        >
          Full store
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </section>
  );
}

function FreeBetTicket({
  stake, price, short, pending, onBuy,
}: {
  stake: number;
  price: number;
  short: boolean;
  pending: boolean;
  onBuy: () => void;
}) {
  return (
    <article
      className="relative flex w-40 shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-[var(--color-surface-border)] bg-[#070D0A]"
    >
      {/* Perforation notch */}
      <span aria-hidden className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-[var(--surface-2)]" />
      <span aria-hidden className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-[var(--surface-2)]" />

      <div className="flex-1 px-3 pt-3 pb-2">
        <Ticket className="h-4 w-4 text-[var(--neon)]" />
        <div className="mt-2 font-display text-2xl font-black leading-none tabular-nums text-[var(--ink)]">
          {stake}
          <span className="ml-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ink-muted)]">
            pts
          </span>
        </div>
        <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--ink-muted)]">
          Free bet · profit only
        </div>
      </div>

      <button
        type="button"
        onClick={onBuy}
        disabled={short || pending}
        className={`flex items-center justify-center gap-1 border-t border-dashed border-[var(--color-surface-border)] py-2 text-[11px] font-bold uppercase tracking-[0.22em] transition-colors ${
          short
            ? "cursor-not-allowed text-[var(--ink-muted)]"
            : "bg-[var(--neon)] text-black hover:brightness-110"
        }`}
      >
        {short ? (
          <>
            <Lock className="h-3 w-3" />
            {price} CSSE
          </>
        ) : (
          <>Buy · {price} CSSE</>
        )}
      </button>
    </article>
  );
}
