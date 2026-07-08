import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyTransactions } from "@/lib/wallet.functions";
import { Loader2, Receipt, ArrowLeft, ArrowUpRight } from "lucide-react";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell, StencilPanel } from "@/components/ui/page-shell";

export const Route = createFileRoute("/_authenticated/wallet/transaction-list")({
  ssr: false,
  head: () => ({ meta: [{ title: "Transaction history — cssebets" }] }),
  component: TransactionListPage,
});

function TransactionListPage() {
  const tFn = useServerFn(listMyTransactions);
  const qc = useQueryClient();
  const { user } = useAuth();
  const uid = user?.id;

  const txns = useQuery({
    queryKey: ["my-txns", uid],
    queryFn: () => tFn({ data: { limit: 200 } }),
    enabled: !!uid,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });

  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`wallet-txns-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_transactions", filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-txns", uid] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, uid]);

  return (
    <PageShell kicker="Wallet" title="Transaction" titleAccent="History">
      <div>
        <Link to="/wallet" className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)] hover:text-[var(--color-neon)]">
          <ArrowLeft className="h-3 w-3" /> Back to wallet
        </Link>
      </div>

      <StencilPanel kicker={<><Receipt className="h-3 w-3" /> Transaction history</>}>
        {txns.isLoading ? (
          <Loader2 className="animate-spin h-5 w-5 text-[var(--color-ink-muted)]" />
        ) : !txns.data?.transactions.length ? (
          <p className="text-sm text-[var(--color-ink-muted)]">No transactions yet.</p>
        ) : (
          <div className="space-y-2">
            {txns.data.transactions.map((t: any) => {
              const sign = t.type === "debit" ? "-" : "+";
              const color = t.type === "debit" ? "text-destructive" : "text-[var(--color-neon)]";
              return (
                <div key={t.id} className="flex items-center justify-between border border-[var(--color-surface-border)] bg-[#070D0A] p-3 text-sm">
                  <div>
                    <div className="font-semibold capitalize">{t.type} · {String(t.reference_type ?? "").replace(/_/g, " ")}</div>
                    <div className="text-[11px] text-[var(--color-ink-muted)]">
                      {new Date(t.created_at).toLocaleString()}
                      {t.note ? ` · ${t.note}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold tabular-nums ${color}`}>{sign}{Number(t.amount).toLocaleString()}</div>
                    <div className="text-[10px] text-[var(--color-ink-muted)] tabular-nums">bal {Number(t.balance_after).toLocaleString()}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3">
          <Link to="/matches" className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-neon)] hover:underline">
            Place a bet on Matches <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </StencilPanel>
    </PageShell>
  );
}
