import { createFileRoute, Outlet, redirect, Link, useRouter, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyStaffRole, getStaffCounts, staffUnreadConvCount, getMyForcePasswordChange } from "@/lib/management.functions";
import { Shield, LogOut, Loader2, Crown, Headset, LayoutDashboard, MessageCircle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";


export const Route = createFileRoute("/management")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Login & access-denied are open
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
  const path = location.pathname;

  const isPublicRoute = path === "/management/login" || path === "/management/access-denied";
  const isChangePwRoute = path === "/management/change-password";

  // Track whether a Supabase session exists; queries below must NOT fire
  // without it (would 401 in the auth middleware).
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

  // Re-check the session right before every server-fn call: polling queries
  // can otherwise fire mid sign-out and hit the server with no bearer token.
  async function withSession<T>(fn: () => Promise<T>): Promise<T | null> {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    return fn();
  }

  // All hooks must run on every render, regardless of route — never put hooks
  // after an early return (React error #310).
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
    const base = "cssebets management";
    document.title = totalBadge > 0 ? `(${totalBadge > 99 ? "99+" : totalBadge}) ${base}` : base;
  }, [totalBadge, isPublicRoute]);

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/management/login", replace: true });
  }

  // ---------- Early returns (after all hooks) ----------
  if (isPublicRoute) {
    return (
      <div className="min-h-screen bg-black text-slate-100">
        <Outlet />
      </div>
    );
  }

  if (isChangePwRoute) {
    return (
      <div className="min-h-screen bg-black text-slate-100">
        <Outlet />
      </div>
    );
  }

  if (roleQ.isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-black text-slate-100">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!role) {
    return (
      <div className="min-h-screen grid place-items-center bg-black text-slate-100 p-4">
        <div className="max-w-md text-center space-y-4 p-8 rounded-xl border border-violet-950/50 bg-zinc-950">
          <Shield className="h-10 w-10 mx-auto text-violet-300" />
          <h1 className="text-xl font-bold">Staff portal</h1>
          <p className="text-sm text-slate-400">You are signed in, but you don't have staff permissions.</p>
          <Button variant="outline" onClick={signOut} className="w-full">Sign out</Button>
        </div>
      </div>
    );
  }

  if (path.startsWith("/management/admin") && !isAdminTier) {
    throw redirect({ to: "/management/access-denied" });
  }
  if (path.startsWith("/management/super-admin") && !isSuper) {
    throw redirect({ to: "/management/access-denied" });
  }

  const nav: { to: string; label: string; icon: any; badge?: number }[] = [];
  nav.push({ to: "/management/support", label: "Support", icon: Headset, badge: supportBadge });
  nav.push({ to: "/management/chat", label: "Chat", icon: MessageCircle, badge: chatBadge });
  if (isAdminTier) nav.push({ to: "/management/admin", label: "Admin", icon: LayoutDashboard });
  if (isSuper) nav.push({ to: "/management/super-admin", label: "Super Admin", icon: Crown });
  nav.push({ to: "/management/settings", label: "Settings", icon: Settings });


  function Badge({ n }: { n: number }) {
    if (!n || n <= 0) return null;
    const label = n > 99 ? "99+" : String(n);
    return (
      <span className="absolute -top-1.5 -right-1.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-500 ring-2 ring-black px-1 text-[10px] font-bold text-white tabular-nums shadow-lg shadow-red-500/30">
        {label}
      </span>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-black text-slate-100">
      <header className="sticky top-0 z-40 border-b border-violet-950/40 bg-zinc-950/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <Link to="/management/support" className="flex items-center gap-2 font-bold">
            <Shield className="h-5 w-5 text-violet-300" />
            <span className="text-white">cssebets management</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="relative px-3 py-1.5 rounded-md text-sm text-slate-300 hover:bg-violet-950/40 hover:text-violet-200 inline-flex items-center gap-1.5 [&.active]:bg-violet-950/60 [&.active]:text-violet-200"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  <Badge n={item.badge ?? 0} />
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs px-2 py-1 rounded-full bg-violet-950/50 text-violet-200 capitalize">
              {role.replace("_", " ")}
            </span>
            <Button variant="ghost" size="sm" onClick={signOut} className="text-slate-300 hover:text-violet-200">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <nav className="md:hidden flex items-center gap-2 px-3 pb-2 overflow-x-auto">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="relative shrink-0 px-3 py-1.5 rounded-md text-xs bg-zinc-900 hover:bg-violet-950/50 inline-flex items-center gap-1.5 [&.active]:bg-violet-950 [&.active]:text-white"
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
                <Badge n={item.badge ?? 0} />
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
