import { createFileRoute, redirect, Outlet, Link, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPendingPointRequestCount } from "@/lib/wallet.functions";
import { getPendingPayoutCount } from "@/lib/payout.functions";
import { getPendingUserCount } from "@/lib/admin.functions";
import {
  LayoutDashboard,
  Users,
  ListChecks,
  CalendarDays,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  Wallet,
  Banknote,
  TrendingUp,
  
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const has = (roles ?? []).some((r) =>
      ["admin", "super_admin", "viewer"].includes(r.role as string),
    );
    if (!has) throw redirect({ to: "/dashboard" });
  },
  head: () => ({ meta: [{ title: "Admin — cssebets" }] }),
  component: AdminLayout,
});

type BadgeKey = "pendingPointRequests" | "pendingPayouts" | "pendingUsers";
const NAV: Array<{ to: string; label: string; icon: any; exact?: boolean; badgeKey?: BadgeKey }> = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/users", label: "Users", icon: Users, badgeKey: "pendingUsers" },
  { to: "/admin-wallet", label: "Point Requests", icon: Wallet, badgeKey: "pendingPointRequests" },
  { to: "/admin-payout", label: "Payouts", icon: Banknote, badgeKey: "pendingPayouts" },
  { to: "/admin/predictions", label: "Predictions", icon: ListChecks },
  { to: "/admin/matches", label: "Matches", icon: CalendarDays },
  { to: "/admin/tournament", label: "Tournament", icon: Shield },
  { to: "/admin/odds-history", label: "Odds history", icon: TrendingUp },
  { to: "/admin/wallet-ledger", label: "Wallet ledger", icon: Wallet },
  { to: "/admin/bankroll", label: "Bankroll", icon: TrendingUp },
  { to: "/admin/risk-settings", label: "Risk settings", icon: ShieldAlert },
  { to: "/admin/match-pools", label: "Match pools", icon: Wallet },
  { to: "/admin/simulation", label: "Simulation Mode", icon: ShieldAlert },
  { to: "/admin/audit", label: "Audit", icon: ScrollText },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

function AdminLayout() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const countFn = useServerFn(getPendingPointRequestCount);
  const payoutCountFn = useServerFn(getPendingPayoutCount);
  const userCountFn = useServerFn(getPendingUserCount);
  const pendingCount = useQuery({
    queryKey: ["pending-point-request-count"],
    queryFn: () => countFn({}),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const pendingPayoutCount = useQuery({
    queryKey: ["pending-payout-count"],
    queryFn: () => payoutCountFn({}),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const pendingUserCount = useQuery({
    queryKey: ["pending-user-count"],
    queryFn: () => userCountFn({}),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const badges = {
    pendingPointRequests: pendingCount.data?.count ?? 0,
    pendingPayouts: pendingPayoutCount.data?.count ?? 0,
    pendingUsers: pendingUserCount.data?.count ?? 0,
  } as const;


  return (
    <div className="flex gap-4 min-h-[calc(100vh-7rem)]">
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="md:hidden fixed bottom-24 right-4 z-30 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg"
        aria-label="Toggle admin menu"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          "md:sticky md:top-16 md:self-start md:h-fit z-30",
          "bg-card border rounded-lg p-2 w-56 shrink-0",
          open
            ? "fixed inset-x-4 top-20 block"
            : "hidden md:block",
        )}
      >
        <div className="px-3 py-2 flex items-center gap-2 border-b mb-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Admin</span>
        </div>
        <nav className="space-y-1">
          {NAV.map((item) => {
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            const Icon = item.icon;
            const badge = item.badgeKey ? badges[item.badgeKey] : 0;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {badge > 0 && (
                  <span className="ml-auto inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground tabular-nums">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

      </aside>

      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
