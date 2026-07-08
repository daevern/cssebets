import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyWallet } from "@/lib/wallet.functions";
import { getHouseBankrollSummary } from "@/lib/bankroll.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell, StencilPanel } from "@/components/ui/page-shell";
import { WalletCreditCard, WalletActions } from "@/components/wallet/WalletCard";
import { Landmark } from "lucide-react";

export const Route = createFileRoute("/_authenticated/wallet")({
  ssr: false,
  head: () => ({ meta: [{ title: "My Wallet — cssebets" }] }),
  component: WalletPage,
});

function WalletPage() {
  const wFn = useServerFn(getMyWallet);
  const houseFn = useServerFn(getHouseBankrollSummary);
  const { user } = useAuth();
  const uid = user?.id;

  const roles = useQuery({
    queryKey: ["my-roles", uid],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid!);
      return (data ?? []).map((r: any) => r.role as string);
    },
    enabled: !!uid,
  });
  const isAdmin = (roles.data ?? []).some((r) => ["admin", "super_admin", "viewer"].includes(r));

  const wallet = useQuery({
    queryKey: ["my-wallet", uid],
    queryFn: () => wFn({}),
    enabled: !!uid,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const profile = useQuery({
    queryKey: ["my-profile-name", uid],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("display_name").eq("id", uid!).maybeSingle();
      return (data as any)?.display_name ?? null;
    },
    enabled: !!uid,
    staleTime: 60_000,
  });

  const house = useQuery({
    queryKey: ["house-bankroll-summary"],
    queryFn: () => houseFn(),
    enabled: isAdmin,
    refetchInterval: 5000,
  });

  return (
    <PageShell kicker="Points Wallet" title="Your" titleAccent="Portfolio">
      <div className="flex flex-col items-center gap-5 py-2">
        <WalletCreditCard
          displayName={profile.data ?? (user?.email?.split("@")[0] ?? null)}
          userId={uid}
          createdAt={user?.created_at ?? null}
          balance={wallet.data?.balance ?? 0}
        />
        <WalletActions />
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
            </div>
          </div>
        </StencilPanel>
      )}
    </PageShell>
  );
}
