import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyWallet,
  listMyTransactions,
  listMyRequests,
} from "@/lib/wallet.functions";
import { getHouseBankrollSummary } from "@/lib/bankroll.functions";
import { Badge } from "@/components/ui/badge";
import { Loader2, Landmark, ArrowUpRight, Receipt } from "lucide-react";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell, StencilPanel } from "@/components/ui/page-shell";
import { WalletCreditCard } from "@/components/wallet/WalletCard";


export const Route = createFileRoute("/_authenticated/wallet")({
  ssr: false,
  head: () => ({ meta: [{ title: "My Wallet — cssebets" }] }),
  component: WalletPage,
});


function WalletPage() {
  const wFn = useServerFn(getMyWallet);
  const tFn = useServerFn(listMyTransactions);
  const rFn = useServerFn(listMyRequests);
  const qc = useQueryClient();
  const { user } = useAuth();
  const uid = user?.id;
  const houseFn = useServerFn(getHouseBankrollSummary);

  const roles = useQuery({
    queryKey: ["my-roles", uid],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid!);
      return (data ?? []).map((r: any) => r.role as string);
    },
    enabled: !!uid,
  });
  const isAdmin = (roles.data ?? []).some((r) => ["admin", "super_admin", "viewer"].includes(r));

  const house = useQuery({
    queryKey: ["house-bankroll-summary"],
    queryFn: () => houseFn(),
    enabled: isAdmin,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const wallet = useQuery({
    queryKey: ["my-wallet", uid],
    queryFn: () => wFn({}),
    enabled: !!uid,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const myProfile = useQuery({
    queryKey: ["my-profile-ref", uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("public_reference, display_name")
        .eq("id", uid!)
        .maybeSingle();
      if (error) throw error;
      return {
        reference: (data as any)?.public_reference ?? null,
        displayName: (data as any)?.display_name ?? null,
      };
    },
    enabled: !!uid,
    staleTime: 60_000,
  });
  const txns = useQuery({
    queryKey: ["my-txns", uid],
    queryFn: () => tFn({ data: { limit: 50 } }),
    enabled: !!uid,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const reqs = useQuery({
    queryKey: ["my-point-requests", uid],
    queryFn: () => rFn({}),
    enabled: !!uid,
  });

  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`wallet-live-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-wallet", uid] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_transactions", filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-txns", uid] });
        qc.invalidateQueries({ queryKey: ["my-wallet", uid] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "predictions", filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-predictions", uid] });
        qc.invalidateQueries({ queryKey: ["my-wallet", uid] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "point_requests", filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-point-requests", uid] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, uid]);

  return (
    <PageShell
      kicker="Points Wallet"
      title="Your"
      titleAccent="Transactions"
    >
      {/* Balance hero — Member card */}
      <div className="flex justify-center py-2">
        <WalletCreditCard
          displayName={myProfile.data?.displayName ?? (user?.email?.split("@")[0] ?? null)}
          userId={uid}
          createdAt={user?.created_at ?? null}
          balance={wallet.data?.balance ?? 0}
          reference={myProfile.data?.reference ?? wallet.data?.publicReference ?? null}
        />
      </div>



      

      {isAdmin && (
        <StencilPanel
          kicker={<><Landmark className="h-3 w-3" /> House P/L · Bankroller</>}
          meta="ADMIN"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">Real bankroll P/L</div>
              <div className={`mt-1 font-display text-3xl font-bold tabular-nums ${(house.data?.real.netPL ?? 0) >= 0 ? "text-[var(--color-neon)]" : "text-destructive"}`}>
                {house.isLoading ? "…" : `${(house.data?.real.netPL ?? 0) > 0 ? "+" : ""}${Number(house.data?.real.netPL ?? 0).toLocaleString()}`}
                <span className="ml-1 text-xs font-bold uppercase tracking-widest text-[var(--color-ink-muted)]">pts</span>
              </div>
              <div className="mt-1 text-[10px] tabular-nums text-[var(--color-ink-muted)]">
                Stakes {Number(house.data?.real.totalStakes ?? 0).toLocaleString()} · Payouts {Number(house.data?.real.totalPayouts ?? 0).toLocaleString()} · Seed {Number((house.data?.real.balance ?? 0) - (house.data?.real.netPL ?? 0)).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">Simulation bankroll</div>
              <div className="mt-1 font-display text-3xl font-bold tabular-nums text-[var(--color-ink)]">
                {house.isLoading ? "…" : (house.data?.simulation.balance ?? 0).toLocaleString()}
                <span className="ml-1 text-xs font-bold uppercase tracking-widest text-[var(--color-ink-muted)]">pts</span>
              </div>
              <div className="mt-1 text-[10px] tabular-nums text-[var(--color-ink-muted)]">
                Stakes {Number(house.data?.simulation.totalStakes ?? 0).toLocaleString()} · Payouts {Number(house.data?.simulation.totalPayouts ?? 0).toLocaleString()} · Net{" "}
                <span className={(house.data?.simulation.netPL ?? 0) >= 0 ? "text-[var(--color-neon)]" : "text-destructive"}>
                  {Number(house.data?.simulation.netPL ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </StencilPanel>
      )}

      {/* Point requests */}
      <StencilPanel kicker={<><Receipt className="h-3 w-3" /> My point requests</>}>
        {reqs.isLoading ? (
          <Loader2 className="animate-spin h-5 w-5 text-[var(--color-ink-muted)]" />
        ) : !reqs.data?.requests.length ? (
          <p className="text-sm text-[var(--color-ink-muted)]">No requests yet.</p>
        ) : (
          <div className="space-y-2">
            {reqs.data.requests.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between border border-[var(--color-surface-border)] bg-[#070D0A] p-3 text-sm">
                <div className="min-w-0">
                  <div className="font-bold tabular-nums">{Number(r.requested_amount).toLocaleString()} <span className="text-[10px] uppercase tracking-widest text-[var(--color-ink-muted)]">pts</span></div>
                  <div className="text-[11px] text-[var(--color-ink-muted)]">
                    {new Date(r.submitted_at ?? r.requested_at).toLocaleString()}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </div>
                  {r.status === "rejected" && r.rejection_reason && (
                    <div className="text-[11px] text-destructive mt-1">Reason: {r.rejection_reason}</div>
                  )}
                </div>
                <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"} className="uppercase tracking-wider text-[10px]">
                  {r.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </StencilPanel>

      {/* Transactions */}
      <StencilPanel tour="transaction-history" kicker={<><Receipt className="h-3 w-3" /> Transaction history</>}>
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
                    <div className="font-semibold capitalize">{t.type} · {t.reference_type.replace("_", " ")}</div>
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


