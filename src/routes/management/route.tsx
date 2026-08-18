import { createFileRoute, Outlet, redirect, Link, useRouter, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyStaffRole, getStaffCounts, staffUnreadConvCount, getMyForcePasswordChange } from "@/lib/management.functions";
import { Loader2, LogOut, LayoutDashboard, MessageSquare, Settings, Shield, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { CsseMark } from "@/components/brand/CsseMark";

export const Route = createFileRoute("/management")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (location.pathname === "/management/login" || location.pathname === "/management/access-denied") {
      return {};
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/management/login" });
    return { userId: data.user.id };
  },
  component: ManagementLayout,
});

function ManagementLayout() {
  const location = useLocation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const path = location.pathname;

  const isPublicRoute = path === "/management/login" || path === "/management/access-denied";
  const isChangePwRoute = path === "/management/change-password";
  // Only the Ops area ships its own sidebar; every other area (including
  // Super) keeps the top nav so staff can switch between consoles.
  const isAdminArea = path.startsWith("/management/admin");

  const [hasSession, setHasSession] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const canQuery = !isPublicRoute && hasSession === true;

  async function withSession<T>(fn: () => Promise<T>): Promise<T | null> {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    return fn();
  }

  const roleFn = useServerFn(getMyStaffRole);
  const roleQ = useQuery({
    queryKey: ["mgmt-role"],
    queryFn: () => withSession(() => roleFn({})),
    staleTime: 30_000,
    enabled: canQuery,
  });

  const countsFn = useServerFn(getStaffCounts);
  const counts = useQuery({
    queryKey: ["mgmt-counts"],
    queryFn: () => withSession(() => countsFn({})),
    enabled: canQuery && !!roleQ.data?.role,
    refetchInterval: 20_000,
  });

  const unreadFn = useServerFn(staffUnreadConvCount);
  const unread = useQuery({
    queryKey: ["mgmt-unread-conv"],
    queryFn: () => withSession(() => unreadFn({})),
    enabled: canQuery && !!roleQ.data?.role,
    refetchInterval: 15_000,
  });

  const forceFn = useServerFn(getMyForcePasswordChange);
  const force = useQuery({
    queryKey: ["mgmt-force-pw"],
    queryFn: () => withSession(() => forceFn({})),
    enabled: canQuery && !!roleQ.data?.role,
  });

  useEffect(() => {
    if (!isPublicRoute && force.data?.force && path !== "/management/change-password") {
      router.navigate({ to: "/management/change-password", replace: true });
    }
  }, [force.data?.force, path, router, isPublicRoute]);

  const role = roleQ.data?.role;
  const isAdminTier = role === "admin" || role === "super_admin";
  const isSuper = role === "super_admin";

  const supportBadge = (counts.data?.pendingUsers ?? 0) + (counts.data?.pendingPointRequests ?? 0);
  const chatBadge = unread.data?.count ?? 0;
  const totalBadge = supportBadge + chatBadge;

  useEffect(() => {
    if (isPublicRoute) return;
    document.title = totalBadge > 0 ? `(${totalBadge > 99 ? "99+" : totalBadge}) CSSEBets Ops` : "CSSEBets Ops";
  }, [totalBadge, isPublicRoute]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/management/login", replace: true });
  }

  const fontLink = (
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
    />
  );

  if (isPublicRoute || isChangePwRoute) {
    return (
      <div className="mgmt-ops">
        {fontLink}
        <Outlet />
      </div>
    );
  }

  if (roleQ.isLoading) {
    return (
      <div className="mgmt-ops grid min-h-screen place-items-center">
        {fontLink}
        <Loader2 className="h-6 w-6 animate-spin text-[var(--mgmt-accent)]" />
      </div>
    );
  }

  if (!role) {
    return (
      <div className="mgmt-ops grid min-h-screen place-items-center p-4">
        {fontLink}
        <article className="w-full max-w-md rounded-xl border border-[var(--mgmt-border)] bg-white p-8 text-center shadow-[var(--mgmt-shadow)]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F0FE]">
            <CsseMark className="h-6 w-6 text-[var(--mgmt-accent)]" />
          </div>
          <h1 className="text-xl font-medium text-[var(--mgmt-ink)]">No staff access</h1>
          <p className="mt-2 text-sm text-[var(--mgmt-muted)]">
            You&apos;re signed in, but this account has no operator clearance.
          </p>
          <button
            onClick={signOut}
            className="mt-6 h-9 w-full rounded-lg border border-[var(--mgmt-border)] text-[13px] font-medium hover:bg-[#F8F9FA]"
          >
            Sign out
          </button>
        </article>
      </div>
    );
  }

  if (path.startsWith("/management/admin") && !isAdminTier) {
    throw redirect({ to: "/management/access-denied" });
  }
  if (path.startsWith("/management/super-admin") && !isSuper) {
    throw redirect({ to: "/management/access-denied" });
  }

  const topNav: { to: string; label: string; icon: typeof Users; badge?: number }[] = [
    { to: "/management/support", label: "Support", icon: MessageSquare, badge: supportBadge },
    { to: "/management/users", label: "Players", icon: Users },
    { to: "/management/chat", label: "Chat", icon: MessageSquare, badge: chatBadge },
  ];
  if (isAdminTier) topNav.push({ to: "/management/admin", label: "Ops", icon: LayoutDashboard });
  if (isSuper) topNav.push({ to: "/management/super-admin", label: "Super", icon: Shield });
  topNav.push({ to: "/management/settings", label: "Settings", icon: Settings });

  return (
    <div className="mgmt-ops flex min-h-screen flex-col">
      {fontLink}

      {/* Top app bar — always visible */}
      <header className="sticky top-0 z-40 border-b border-[var(--mgmt-border)] bg-white">
        <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-5">
          <Link to="/management/support" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E8F0FE]">
              <CsseMark className="h-4 w-4 text-[var(--mgmt-accent)]" />
            </div>
            <div className="leading-tight">
              <div className="text-[14px] font-medium text-[var(--mgmt-ink)]">CSSEBets</div>
              <div className="text-[11px] text-[var(--mgmt-muted)]">Operator console</div>
            </div>
          </Link>

          {!isAdminArea && (
            <nav className="hidden items-center gap-1 md:flex">
              {topNav.map((item) => {
                const Icon = item.icon;
                const active =
                  path === item.to ||
                  (item.to === "/management/admin" && path.startsWith("/management/admin")) ||
                  (item.to !== "/management/admin" && path.startsWith(item.to) && item.to !== "/management/support"
                    ? path.startsWith(item.to)
                    : path === item.to || (item.to === "/management/support" && path.startsWith("/management/support")));
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium ${
                      active
                        ? "bg-[#E8F0FE] text-[var(--mgmt-accent)]"
                        : "text-[var(--mgmt-muted)] hover:bg-[#F1F3F4] hover:text-[var(--mgmt-ink)]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                    {!!item.badge && item.badge > 0 && (
                      <span className="rounded-full bg-[var(--mgmt-accent)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          )}

          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-[#F1F3F4] px-2.5 py-1 text-[11px] font-medium capitalize text-[var(--mgmt-muted)] sm:inline">
              {role.replace("_", " ")}
            </span>
            <button
              onClick={signOut}
              title="Sign out"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--mgmt-muted)] hover:bg-[#F1F3F4] hover:text-[var(--mgmt-ink)]"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Mobile top nav when not in admin (admin has its own sidebar) */}
        {!isAdminArea && (
          <nav className="flex gap-1 overflow-x-auto border-t border-[var(--mgmt-border)] px-3 py-2 md:hidden">
            {topNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="shrink-0 rounded-lg bg-[#F8F9FA] px-3 py-1.5 text-[12px] font-medium text-[var(--mgmt-muted)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className={`relative flex-1 ${isAdminArea ? "" : "mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6"}`}>
        <Outlet />
      </main>
    </div>
  );
}
