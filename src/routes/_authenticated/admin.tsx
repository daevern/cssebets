import { createFileRoute, redirect, Outlet, Link, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
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
  TrendingUp,
  LineChart as LineChartIcon,
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
    if (!has) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Admin — WC26 Pool" }] }),
  component: AdminLayout,
});

const NAV: Array<{ to: string; label: string; icon: any; exact?: boolean }> = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/predictions", label: "Predictions", icon: ListChecks },
  { to: "/admin/matches", label: "Matches", icon: CalendarDays },
  { to: "/admin/odds-history", label: "Odds history", icon: TrendingUp },
  { to: "/admin/wallet-ledger", label: "Wallet ledger", icon: Wallet },
  { to: "/admin/bankroll", label: "Bankroll", icon: TrendingUp },
  { to: "/admin/match-pools", label: "Match pools", icon: Wallet },
  { to: "/admin/simulator", label: "Simulator", icon: LineChartIcon },
  { to: "/admin/risk", label: "Risk", icon: ShieldAlert },
  { to: "/admin/audit", label: "Audit", icon: ScrollText },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

function AdminLayout() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

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
                {item.label}
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
