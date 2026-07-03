import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coins, Ticket, ArrowRight } from "lucide-react";
import { listStoreItems, purchaseFreeBet, listMyFreeBets } from "@/lib/freebets.functions";
import { getMyEngagementSummary } from "@/lib/engagement.functions";

export const Route = createFileRoute("/_authenticated/store")({
  component: StorePage,
});

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
      toast.success("Free bet added — go place it.");
      qc.invalidateQueries({ queryKey: ["engagement-summary"] });
      qc.invalidateQueries({ queryKey: ["my-free-bets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const balance = summary.data?.tokens.balance ?? 0;

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 pb-24 pt-4 text-[var(--color-ink)]">
      <div>
        <h1 className="text-2xl font-bold">CSSE Store</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">Spend tokens on free bets. Keep only the profit.</p>
      </div>

      <Card className="rounded-none border-[var(--color-surface-border)] bg-[#070D0A] p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--color-ink-muted)]">CSSE balance</div>
            <div className="mt-1 font-mono text-3xl font-bold text-[var(--neon)]">{balance.toLocaleString()}</div>
          </div>
          <Coins className="h-8 w-8 text-[var(--neon)]/60" />
        </div>
        <div className="mt-3 flex gap-2 text-xs">
          <Link to="/referrals" className="text-[var(--neon)] underline">Earn more via referrals</Link>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        {(items.data ?? []).map((it: any) => {
          const short = balance < it.token_price;
          return (
            <Card key={it.id} className="rounded-none border-[var(--color-surface-border)] bg-[#070D0A] p-3">
              <Ticket className="h-5 w-5 text-[var(--neon)]" />
              <div className="mt-2 font-mono text-2xl font-bold">{Number(it.stake_amount)} pts</div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--color-ink-muted)]">Free bet</div>
              <div className="mt-2 text-xs text-[var(--color-ink-muted)]">Costs {it.token_price} CSSE</div>
              <Button
                disabled={short || buy.isPending}
                onClick={() => buy.mutate(it.item_key)}
                title={short ? `Need ${(it.token_price - balance).toLocaleString()} more CSSE` : undefined}
                className="mt-3 w-full rounded-none bg-[var(--neon)] text-black hover:bg-[var(--neon)]/90 disabled:opacity-40"
              >
                {short ? "Not enough CSSE" : "Buy"}
              </Button>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-none border-[var(--color-surface-border)] bg-[#070D0A]">
        <div className="border-b border-[var(--color-surface-border)] p-3 text-sm font-semibold">My free bets</div>
        <div className="divide-y divide-[var(--color-surface-border)]">
          {(myFbs.data?.available ?? []).map((f: any) => (
            <div key={f.id} className="flex items-center justify-between p-3">
              <div>
                <div className="font-mono text-lg font-bold">{Number(f.stake_amount)} pts</div>
                <div className="text-[10px] text-[var(--color-ink-muted)]">
                  Bought {new Date(f.created_at).toLocaleDateString()}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => navigate({ to: "/free-bets/place", search: { fb: f.id } as any })}
                className="gap-1 rounded-none bg-[var(--neon)] text-black hover:bg-[var(--neon)]/90"
              >
                Use on a match <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {!myFbs.data?.available?.length && (
            <div className="p-6 text-center text-sm text-[var(--color-ink-muted)]">
              No available free bets. Buy one above.
            </div>
          )}
          {(myFbs.data?.all ?? []).filter((f: any) => f.status !== "available").slice(0, 8).map((f: any) => (
            <div key={f.id} className="flex items-center justify-between p-3 opacity-60">
              <div>
                <div className="font-mono text-sm">{Number(f.stake_amount)} pts</div>
                <div className="text-[10px] text-[var(--color-ink-muted)]">
                  {f.status.toUpperCase()} · {f.settled_outcome ?? "—"}
                </div>
              </div>
              <Badge variant="outline" className="rounded-none border-[var(--color-surface-border)] text-[10px]">
                {f.status}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
