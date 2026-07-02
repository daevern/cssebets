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
import { CsseMark } from "@/components/brand/CsseMark";
import { CsseLogoAnimated } from "@/components/brand/CsseLogoAnimated";
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
        className="relative min-h-screen cursor-pointer bg-[var(--color-surface)] text-[var(--color-ink)]"
        onClick={triggerRedirect}
      >
        {/* Scanline grain */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, var(--color-neon) 0 1px, transparent 1px 3px)",
          }}
        />
        {/* Neon top wash */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 h-[420px]"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(34,224,107,0.12), transparent 60%)",
          }}
        />
        <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 py-10">
          <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-neon)]" />
            Full-time · Session ended
          </div>

          <article className="relative w-full overflow-hidden border border-[var(--color-neon)]/25 bg-[var(--color-surface-2)]">
            <span aria-hidden className="pointer-events-none absolute top-0 left-0 h-3 w-3 border-t border-l border-[var(--color-neon)]" />
            <span aria-hidden className="pointer-events-none absolute top-0 right-0 h-3 w-3 border-t border-r border-[var(--color-neon)]" />
            <span aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b border-l border-[var(--color-neon)]" />
            <span aria-hidden className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b border-r border-[var(--color-neon)]" />

            <div className="flex items-center justify-between border-b border-dashed border-[var(--color-surface-border)] px-5 py-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
                Signed out
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
                Locker room
              </span>
            </div>

            <div className="space-y-5 px-6 py-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center border border-[var(--color-neon)]/40 bg-[#070D0A]">
                <IconLogout className="h-7 w-7 text-[var(--color-neon)]" />
              </div>

              <h1 className="font-display text-[26px] font-bold leading-[1.05] tracking-tight md:text-[30px]">
                Whistle blown.<br />
                <span className="text-[var(--color-neon)]">See you next matchday.</span>
              </h1>

              <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
                Your session is closed. Routing you back to the tunnel — tap anywhere to skip.
              </p>

              <div className="flex items-center justify-center gap-2 pt-1 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-neon)]" />
                Redirecting
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-dashed border-[var(--color-surface-border)] px-5 py-2.5">
              <span className="text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)]">
                FIFA World Cup
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
                Tap to skip
              </span>
            </div>
          </article>

          <p className="mt-6 text-center text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)]">
            Competitive Strategy Starts Everywhere
          </p>
        </div>
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
      <div className="relative min-h-screen bg-[var(--surface)] text-[var(--ink)]">
        <WelcomeModal />
        <TopBar
          balance={showBalance ? (wallet.data?.balance ?? 0) : null}
          loading={wallet.isLoading}
          onSignOut={signOut}
        />

        <main className="mx-auto w-full max-w-md safe-bottom">
          <Outlet />
        </main>

        <BottomNav />
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
