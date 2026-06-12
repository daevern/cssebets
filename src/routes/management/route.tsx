import { createFileRoute, Outlet, redirect, Link, useRouter, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyStaffRole, getStaffCounts } from "@/lib/management.functions";
import { Shield, LogOut, Loader2, Crown, Headset, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  // Public sub-routes
  if (location.pathname === "/management/login" || location.pathname === "/management/access-denied") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Outlet />
      </div>
    );
  }

  const roleFn = useServerFn(getMyStaffRole);
  const roleQ = useQuery({ queryKey: ["mgmt-role"], queryFn: () => roleFn({}), staleTime: 30_000 });

  const countsFn = useServerFn(getStaffCounts);
  const counts = useQuery({
    queryKey: ["mgmt-counts"],
    queryFn: () => countsFn({}),
    enabled: !!roleQ.data?.role,
    refetchInterval: 20_000,
  });

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/management/login", replace: true });
  }

  if (roleQ.isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-100">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const role = roleQ.data?.role;
  if (!role) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-100 p-4">
        <div className="max-w-md text-center space-y-4 p-8 rounded-xl border border-slate-800 bg-slate-900">
          <Shield className="h-10 w-10 mx-auto text-amber-400" />
          <h1 className="text-xl font-bold">Staff portal</h1>
          <p className="text-sm text-slate-400">You are signed in, but you don't have staff permissions.</p>
          <Button variant="outline" onClick={signOut} className="w-full">Sign out</Button>
        </div>
      </div>
    );
  }

  // Route gating per role
  const path = location.pathname;
  const isAdminTier = role === "admin" || role === "super_admin";
  const isSuper = role === "super_admin";
  if (path.startsWith("/management/admin") && !isAdminTier) {
    throw redirect({ to: "/management/access-denied" });
  }
  if (path.startsWith("/management/super-admin") && !isSuper) {
    throw redirect({ to: "/management/access-denied" });
  }

  const nav: { to: string; label: string; icon: any; badge?: number }[] = [];
  nav.push({ to: "/management/support", label: "Support", icon: Headset, badge: (counts.data?.pendingUsers ?? 0) + (counts.data?.pendingPointRequests ?? 0) });
  if (isAdminTier) nav.push({ to: "/management/admin", label: "Admin", icon: LayoutDashboard });
  if (isSuper) nav.push({ to: "/management/super-admin", label: "Super Admin", icon: Crown });

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <Link to="/management/support" className="flex items-center gap-2 font-bold">
            <Shield className="h-5 w-5 text-amber-400" />
            <span>CSSE Management</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="relative px-3 py-1.5 rounded-md text-sm hover:bg-slate-800 [&.active]:bg-slate-800 [&.active]:text-amber-400"
              >
                {item.label}
                {(item.badge ?? 0) > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white tabular-nums">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs px-2 py-1 rounded-full bg-slate-800 capitalize">
              {role.replace("_", " ")}
            </span>
            <Button variant="ghost" size="sm" onClick={signOut} className="text-slate-300 hover:text-white">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <nav className="md:hidden flex items-center gap-1 px-3 pb-2 overflow-x-auto">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="shrink-0 px-3 py-1.5 rounded-md text-xs bg-slate-800/50 hover:bg-slate-800 [&.active]:bg-amber-500/20 [&.active]:text-amber-400"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
