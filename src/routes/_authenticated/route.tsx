import { createFileRoute, Outlet, redirect, Link, useRouter, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAccessToken } from "@/hooks/use-access-token";

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
  IconLogout,
} from "@/components/brand/NavIcons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useEffect, useState, useRef } from "react";
import { TopBar } from "@/components/nav/TopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { WinDetector } from "@/components/notifications/WinDetector";
import { BonusAwardModal } from "@/components/wallet/BonusAwardModal";
import { PendingApproval } from "@/components/auth/PendingApproval";



import { TourProvider, useTour } from "@/components/onboarding/TourProvider";
import { WelcomeModal } from "@/components/onboarding/WelcomeModal";
import { isArcadeTablePath } from "@/lib/arcade/table-mode";

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
  const accessToken = useAccessToken();
  const hasToken = accessToken !== null;
  const router = useRouter();
  const queryClient = useQueryClient();
  const location = useLocation();

  const showBalance = isMember || isAdmin;
  // Always read a live token at call time — a token captured in render can be
  // stale/null by the time a refetch fires, which 500s the protected fn with
  // "Unauthorized: No authorization header provided".
  async function withAuth<T>(fn: (opts: any) => Promise<T>): Promise<T | null> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    return fn({ headers: { Authorization: `Bearer ${token}` } });
  }

  const walletFn = useServerFn(getMyWallet);
  const wallet = useQuery({
    queryKey: ["my-wallet", user?.id],
    queryFn: () => withAuth(walletFn),
    enabled: showBalance && !!user?.id && hasToken,
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
    queryFn: () => withAuth(pointReqFn),
    enabled: isAdmin && hasToken,
    retry: false,
    refetchInterval: 20000,
  });
  const pendingPayouts = useQuery({
    queryKey: ["pending-payout-count"],
    queryFn: () => withAuth(payoutAdminFn),
    enabled: isAdmin && hasToken,
    retry: false,
    refetchInterval: 20000,
  });
  const pendingUsers = useQuery({
    queryKey: ["pending-user-count"],
    queryFn: () => withAuth(pendingUserFn),
    enabled: isAdmin && hasToken,
    retry: false,
    refetchInterval: 20000,
  });
  const myPayoutAction = useQuery({
    queryKey: ["my-payout-action-count", user?.id],
    queryFn: () => withAuth(myPayoutActionFn),
    enabled: !!user?.id && hasToken,
    retry: false,
    refetchInterval: 20000,
  });
  const supportUnreadFn = useServerFn(getMyUnreadSupportCount);
  const supportUnread = useQuery({
    queryKey: ["my-support-unread", user?.id],
    queryFn: () => withAuth(supportUnreadFn),
    enabled: !!user?.id && hasToken,
    retry: false,
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

  const tableMode = isArcadeTablePath(location.pathname);

  // Immersive cabinet: hide sportsbook chrome so the table owns the viewport.
  useEffect(() => {
    if (tableMode) document.documentElement.setAttribute("data-arcade-table", "");
    else document.documentElement.removeAttribute("data-arcade-table");
    return () => document.documentElement.removeAttribute("data-arcade-table");
  }, [tableMode]);


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
    return <PendingApproval email={user?.email} onSignOut={signOut} />;
  }











  return (
    <TourProvider>
      <div className="relative min-h-screen overflow-x-clip bg-[var(--surface)] text-[var(--ink)]">
        <WelcomeModal />
        {!tableMode && (
          <TopBar
            balance={showBalance ? (wallet.data?.balance ?? 0) : null}
            loading={wallet.isLoading}
            onSignOut={signOut}
          />
        )}

        <main
          className={
            location.pathname.startsWith("/arcade")
              ? // Arcade cabinets need room to breathe on wide screens.
                "mx-auto w-full max-w-md overflow-x-clip md:max-w-3xl lg:max-w-4xl xl:max-w-5xl safe-bottom"
              : "mx-auto w-full max-w-md overflow-x-clip md:max-w-2xl safe-bottom"
          }
        >
          <Outlet />
        </main>

        {!tableMode && <BottomNav />}
        <WinDetector />
        <BonusAwardModal />
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
