import { createFileRoute, Outlet, redirect, Link, useRouter, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyWallet } from "@/lib/wallet.functions";
import { Trophy, Home, ListChecks, History, Shield, LogOut, Loader2, Wallet as WalletIcon, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { userId: data.user.id };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { isAdmin, isAdminTier, isMember, isPending, loading, user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const location = useLocation();

  const showBalance = isMember || isAdmin;
  const walletFn = useServerFn(getMyWallet);
  const wallet = useQuery({
    queryKey: ["my-wallet", user?.id],
    queryFn: () => walletFn({}),
    enabled: showBalance && !!user?.id,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });

  // Live wallet balance: refresh whenever this user's wallet/txns/predictions change.
  useEffect(() => {
    if (!showBalance || !user?.id) return;
    const ch = supabase
      .channel(`nav-wallet-live-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["my-wallet", user.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_transactions", filter: `user_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["my-wallet", user.id] });
        queryClient.invalidateQueries({ queryKey: ["my-txns", user.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "predictions", filter: `user_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["my-predictions", user.id] });
        queryClient.invalidateQueries({ queryKey: ["my-wallet", user.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [showBalance, queryClient, user?.id]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isPending && !isMember && !isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center p-4">
        <Card className="max-w-md p-8 text-center space-y-4">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-warning/20 grid place-items-center">
            <Shield className="h-7 w-7 text-warning" />
          </div>
          <h1 className="text-xl font-bold">Waiting for approval</h1>
          <p className="text-sm text-muted-foreground">
            Hi {user?.email}. An admin needs to approve your account before you can join the pool.
          </p>
          <Button variant="outline" onClick={signOut} className="w-full">Sign out</Button>
        </Card>
      </div>
    );
  }

  const navItems = [
    { to: "/", label: "Home", icon: Home },
    { to: "/matches", label: "Matches", icon: ListChecks },
    { to: "/my-predictions", label: "Picks", icon: History },
    { to: "/wallet", label: "Wallet", icon: WalletIcon },
    { to: "/payout", label: "Payout", icon: Banknote },
    ...(isAdminTier ? [{ to: "/admin", label: "Admin", icon: Shield }] : []),
    ...(isAdmin ? [{ to: "/admin-wallet", label: "Points", icon: WalletIcon }] : []),
  ] as const;

  const mobileNavItems = isAdminTier
    ? [
        { to: "/", label: "Home", icon: Home },
        { to: "/matches", label: "Matches", icon: ListChecks },
        { to: "/admin", label: "Admin", icon: Shield },
        { to: "/admin-wallet", label: "Points", icon: WalletIcon },
        { to: "/wallet", label: "Wallet", icon: WalletIcon },
      ]
    : navItems.slice(0, 5);




  return (
    <div className="min-h-screen flex flex-col pb-20 md:pb-0">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <Trophy className="h-5 w-5 text-primary" />
            <span className="hidden sm:inline">cssebets</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="px-3 py-1.5 rounded-md text-sm hover:bg-muted [&.active]:bg-muted [&.active]:text-primary"
                activeOptions={{ exact: item.to === "/" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {isAdminTier && (
              <Link
                to="/admin"
                className="md:hidden grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                title="Admin"
                aria-label="Admin"
              >
                <Shield className="h-4 w-4" />
              </Link>
            )}
            {showBalance && (
              <Link
                to="/wallet"
                className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold tabular-nums hover:bg-muted/80"
                title="Your points balance"
              >
                <WalletIcon className="h-3.5 w-3.5 text-primary" />
                {wallet.isLoading ? "…" : (wallet.data?.balance ?? 0).toLocaleString()}
                <span className="text-muted-foreground font-normal">pts</span>
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>

      {/* Bottom nav mobile */}
      <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t bg-background/95 backdrop-blur">
        <div className="grid grid-cols-5 max-w-md mx-auto">
          {mobileNavItems.map((item) => {
            const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
