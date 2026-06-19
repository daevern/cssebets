import { createFileRoute, Outlet, redirect, Link, useRouter, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyWallet } from "@/lib/wallet.functions";
import { getPendingPointRequestCount } from "@/lib/wallet.functions";
import { getPendingPayoutCount, getMyPayoutActionCount } from "@/lib/payout.functions";
import { getPendingUserCount } from "@/lib/admin.functions";
import { getMyUnreadSupportCount } from "@/lib/support.functions";
import { Shield, LogOut, Loader2 } from "lucide-react";
import { CsseLogo, CsseMark } from "@/components/brand/CsseMark";
import {
  IconHome,
  IconBets,
  IconPicks,
  IconWallet,
  IconPayout,
  IconSupport,
  IconHelp,
  IconSettings,
  IconLogout,
} from "@/components/brand/NavIcons";
import { IconShield, IconBroadcast, IconChangelog } from "@/components/trust/TrustIcons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useEffect, useState, useRef } from "react";
import { ScreenProtection } from "@/components/security/ScreenProtection";
import { TourProvider, useTour } from "@/components/onboarding/TourProvider";
import { WelcomeModal } from "@/components/onboarding/WelcomeModal";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // Block suspended accounts immediately.
    const { data: profile } = await supabase
      .from("profiles").select("suspended").eq("id", data.user.id).maybeSingle();
    if (profile?.suspended) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth", search: { suspended: "1" } as any });
    }
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

  // Pending-action badges
  const pointReqFn = useServerFn(getPendingPointRequestCount);
  const payoutAdminFn = useServerFn(getPendingPayoutCount);
  const pendingUserFn = useServerFn(getPendingUserCount);
  const myPayoutActionFn = useServerFn(getMyPayoutActionCount);

  const pendingPoints = useQuery({
    queryKey: ["pending-point-request-count"],
    queryFn: () => pointReqFn({}),
    enabled: isAdmin,
    refetchInterval: 20000,
  });
  const pendingPayouts = useQuery({
    queryKey: ["pending-payout-count"],
    queryFn: () => payoutAdminFn({}),
    enabled: isAdmin,
    refetchInterval: 20000,
  });
  const pendingUsers = useQuery({
    queryKey: ["pending-user-count"],
    queryFn: () => pendingUserFn({}),
    enabled: isAdmin,
    refetchInterval: 20000,
  });
  const myPayoutAction = useQuery({
    queryKey: ["my-payout-action-count", user?.id],
    queryFn: () => myPayoutActionFn({}),
    enabled: !!user?.id,
    refetchInterval: 20000,
  });
  const supportUnreadFn = useServerFn(getMyUnreadSupportCount);
  const supportUnread = useQuery({
    queryKey: ["my-support-unread", user?.id],
    queryFn: () => supportUnreadFn({}),
    enabled: !!user?.id,
    refetchInterval: 20000,
  });

  const adminBadge =
    (pendingPoints.data?.count ?? 0) +
    (pendingPayouts.data?.count ?? 0) +
    (pendingUsers.data?.count ?? 0);
  const payoutBadge = myPayoutAction.data?.count ?? 0;
  const supportBadge = supportUnread.data?.count ?? 0;

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

  const [signingOut, setSigningOut] = useState(false);
  const redirectTimeoutRef = useRef<any>(null);

  const triggerRedirect = () => {
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    router.navigate({ to: "/auth", replace: true });
  };

  async function signOut() {
    setSigningOut(true);
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    const timeout = setTimeout(() => {
      triggerRedirect();
    }, 5000);
    redirectTimeoutRef.current = timeout;
  }

  if (signingOut) {
    return (
      <div 
        className="min-h-screen grid place-items-center p-4 cursor-pointer select-none"
        onClick={triggerRedirect}
      >
        <Card className="max-w-md p-8 text-center space-y-4 pointer-events-none">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-success/20 grid place-items-center">
            <LogOut className="h-7 w-7 text-success" />
          </div>
          <h1 className="text-xl font-bold">Signed out successfully</h1>
          <p className="text-sm text-muted-foreground">
            You've been signed out. Redirecting you to the login page (or click anywhere to skip)...
          </p>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
        </Card>
      </div>
    );
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
    { to: "/dashboard", label: "Home", icon: IconHome },
    { to: "/bets", label: "Bets", icon: IconBets },
    { to: "/my-predictions", label: "Picks", icon: IconPicks },
    { to: "/wallet", label: "Wallet", icon: IconWallet },
    { to: "/payout", label: "Payout", icon: IconPayout },
    { to: "/support", label: "Support", icon: IconSupport },
  ] as const;

  const mobileNavItems = [
    { to: "/dashboard", label: "Home", icon: IconHome },
    { to: "/bets", label: "Bets", icon: IconBets },
    { to: "/wallet", label: "Wallet", icon: IconWallet },
    { to: "/payout", label: "Payout", icon: IconPayout },
    { to: "/support", label: "Support", icon: IconSupport },
  ];




  return (
    <TourProvider>
    <div className="min-h-screen flex flex-col pb-20 md:pb-0">
      <ScreenProtection
        displayName={user?.user_metadata?.display_name || user?.email?.split("@")[0] || "user"}
        uid={user?.id ?? ""}
      />
      <WelcomeModal />
      {/* Top bar — stencil scoreboard */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-surface-border)] bg-[var(--color-surface)]/90 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface)]/70">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-px h-px"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, var(--color-neon) 0 6px, transparent 6px 12px)",
            opacity: 0.4,
          }}
        />
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <Link to="/dashboard" aria-label="CSSEBets home" className="flex items-center gap-2">
            <span className="sm:hidden"><CsseMark className="h-7 w-7 text-[var(--color-ink)]" title="CSSEBets" /></span>
            <span className="hidden sm:inline-flex"><CsseLogo size={18} /></span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const badge =
                item.to === "/payout" ? payoutBadge :
                item.to === "/support" ? supportBadge : 0;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="relative flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] [&.active]:text-[var(--color-neon)]"
                  activeOptions={{ exact: item.to === "/dashboard" }}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  {badge > 0 && (
                    <span className="absolute -top-0.5 -right-1 inline-flex min-w-[16px] h-[16px] items-center justify-center bg-[var(--color-neon)] px-1 text-[9px] font-bold text-[var(--color-surface)] tabular-nums">
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-1.5">
            {showBalance && (
              <Link
                to="/wallet"
                data-tour="wallet-balance"
                className="relative flex items-center gap-1.5 border border-dashed border-[var(--color-neon)]/40 bg-[var(--color-surface-2)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] tabular-nums text-[var(--color-ink)] hover:border-[var(--color-neon)]"
                title="Your points balance"
              >
                <IconWallet className="h-3.5 w-3.5 text-[var(--color-neon)]" />
                {wallet.isLoading ? "…" : (wallet.data?.balance ?? 0).toLocaleString()}
                <span className="text-[var(--color-ink-muted)] font-semibold">pts</span>
              </Link>
            )}
            <Link to="/trust-center" title="Trust Center" className="hidden md:inline-flex p-2 text-[var(--color-ink-muted)] hover:text-[var(--color-neon)]">
              <IconShield className="h-4 w-4" />
            </Link>
            <Link to="/status" title="Platform Status" className="hidden md:inline-flex p-2 text-[var(--color-ink-muted)] hover:text-[var(--color-neon)]">
              <IconBroadcast className="h-4 w-4" />
            </Link>
            <Link to="/changelog" title="Changelog" className="hidden md:inline-flex p-2 text-[var(--color-ink-muted)] hover:text-[var(--color-neon)]">
              <IconChangelog className="h-4 w-4" />
            </Link>
            <Link to="/help" data-tour="help-link" title="Help Center" className="p-2 text-[var(--color-ink-muted)] hover:text-[var(--color-neon)]">
              <IconHelp className="h-4 w-4" />
            </Link>
            <Link to="/settings" title="Settings" className="p-2 text-[var(--color-ink-muted)] hover:text-[var(--color-neon)]">
              <IconSettings className="h-4 w-4" />
            </Link>
            <button
              onClick={signOut}
              title="Sign out"
              className="p-2 text-[var(--color-ink-muted)] hover:text-[var(--color-neon)]"
            >
              <IconLogout className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>

      {/* Bottom nav mobile — stencil dock */}
      <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-[var(--color-surface-border)] bg-[var(--color-surface)]/95 backdrop-blur">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, var(--color-neon) 0 6px, transparent 6px 12px)",
            opacity: 0.5,
          }}
        />
        <div className="grid grid-cols-5 max-w-md mx-auto">
          {mobileNavItems.map((item) => {
            const active = item.to === "/dashboard" ? location.pathname === "/dashboard" : location.pathname.startsWith(item.to);
            const Icon = item.icon;
            const badge =
              item.to === "/payout" ? payoutBadge :
              item.to === "/support" ? supportBadge : 0;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`relative flex flex-col items-center gap-1 py-2.5 text-[9px] font-bold uppercase tracking-[0.18em] ${active ? "text-[var(--color-neon)]" : "text-[var(--color-ink-muted)]"}`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-0 left-1/2 h-[2px] w-8 -translate-x-1/2 bg-[var(--color-neon)]"
                  />
                )}
                <div className="relative">
                  <Icon className="h-5 w-5" />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 inline-flex min-w-[14px] h-[14px] items-center justify-center bg-[var(--color-neon)] px-1 text-[8px] font-bold text-[var(--color-surface)] tabular-nums">
                      {badge}
                    </span>
                  )}
                </div>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <FirstVisitWalkthroughs />
    </div>
    </TourProvider>
  );
}

// Triggers one-shot walkthroughs for first-time visits to /bets and /wallet.
function FirstVisitWalkthroughs() {
  const { startTour, hasCompleted, isTourActive, status } = useTour();
  const location = useLocation();
  useEffect(() => {
    if (!status || isTourActive) return;
    if (!status.userEnabled || !status.globalEnabled) return;
    // Don't run a first-visit walkthrough until the user has chosen to skip
    // the welcome flow or completed it (so we don't overlap modals).
    if (!status.completedAt && !status.skippedAt) return;

    if (location.pathname === "/bets" && !hasCompleted("first_bet")) {
      startTour("first_bet");
    } else if (location.pathname === "/wallet" && !hasCompleted("first_point_request")) {
      startTour("first_point_request");
    }
  }, [location.pathname, status, hasCompleted, isTourActive, startTour]);
  return null;
}
