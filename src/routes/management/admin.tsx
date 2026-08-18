import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
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
  Activity,
  Bell,
  Stethoscope,
  ClipboardList,
  BarChart3,
  GitBranch,
  Menu,
  X,
  BookOpen,
  Database,
  Gamepad2,
  Spade,
  Trophy,
  Store,
  UserPlus,
  CircleDot,
  MessageSquare,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/management/admin")({
  head: () => ({ meta: [{ title: "Ops — CSSEBets" }] }),
  component: AdminLayout,
});

type BadgeKey = "pendingPointRequests" | "pendingPayouts" | "pendingUsers";
type NavItem = { to: string; label: string; icon: any; exact?: boolean; badgeKey?: BadgeKey };
type NavGroup = { label: string; items: NavItem[] };

/** Keep nav focused — fewer items per group reduces congestion. */
const GROUPS: NavGroup[] = [
  {
    label: "Monitor",
    items: [
      { to: "/management/admin", label: "Overview", icon: LayoutDashboard, exact: true },
      { to: "/management/admin/operations", label: "Live ops", icon: Activity },
      { to: "/management/admin/alerts", label: "Alerts", icon: Bell },
      { to: "/management/admin/incidents", label: "Incidents", icon: GitBranch },
      { to: "/management/admin/health", label: "Health", icon: Stethoscope },
      { to: "/management/admin/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Casino",
    items: [
      { to: "/management/admin/arcade", label: "Arcade floor", icon: Gamepad2 },
      { to: "/management/admin/blackjack", label: "Blackjack", icon: Spade },
    ],
  },
  {
    label: "Sportsbook",
    items: [
      { to: "/management/admin/settlements", label: "Settlements", icon: ClipboardList },
      { to: "/management/admin/predictions", label: "Predictions & bets", icon: ListChecks },
      { to: "/management/admin/matches", label: "World Cup", icon: CalendarDays },
      { to: "/management/admin/football", label: "Football", icon: CircleDot },
      { to: "/management/admin/ufc", label: "UFC", icon: Shield },
      { to: "/management/admin/f1", label: "F1", icon: Trophy },
      { to: "/management/admin/odds-provider", label: "Odds feed", icon: Database },
      { to: "/management/admin/pricing-breakdown", label: "Pricing", icon: TrendingUp },
    ],
  },
  {
    label: "Treasury",
    items: [
      { to: "/management/admin/points", label: "Point requests", icon: Wallet, badgeKey: "pendingPointRequests" },
      { to: "/management/admin/payouts", label: "Payouts", icon: Banknote, badgeKey: "pendingPayouts" },
      { to: "/management/admin/bankroll", label: "Bankroll", icon: TrendingUp },
      { to: "/management/admin/pl-report", label: "P/L", icon: BarChart3 },
      { to: "/management/admin/wallet-ledger", label: "Wallet ledger", icon: Wallet },
      { to: "/management/admin/risk-settings", label: "Risk settings", icon: ShieldAlert },
      { to: "/management/admin/correlated-risk", label: "Correlated risk", icon: ShieldAlert },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/management/admin/users", label: "Players", icon: Users, badgeKey: "pendingUsers" },
      { to: "/management/admin/staff", label: "Staff", icon: Shield },
      { to: "/management/admin/support-ops", label: "Support ops", icon: MessageSquare },
      { to: "/management/admin/referrals", label: "Referrals", icon: UserPlus },
      { to: "/management/admin/store", label: "Store", icon: Store },
    ],
  },
  {
    label: "Governance",
    items: [
      { to: "/management/admin/review", label: "Action review", icon: ScrollText },
      { to: "/management/admin/audit", label: "Audit log", icon: ScrollText },
      { to: "/management/admin/reconciliation", label: "Reconciliation", icon: ShieldAlert },
      { to: "/management/admin/simulation", label: "Simulation", icon: Activity },
      { to: "/management/admin/market-rules", label: "Market rules", icon: BookOpen },
      { to: "/management/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

function AdminLayout() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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

  async function withSession<T>(fn: () => Promise<T>): Promise<T | null> {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    return fn();
  }

  const countFn = useServerFn(getPendingPointRequestCount);
  const payoutCountFn = useServerFn(getPendingPayoutCount);
  const userCountFn = useServerFn(getPendingUserCount);
  const pendingCount = useQuery({
    queryKey: ["pending-point-request-count"],
    queryFn: () => withSession(() => countFn({})),
    enabled: hasSession === true,
    refetchInterval: 15000,
  });
  const pendingPayoutCount = useQuery({
    queryKey: ["pending-payout-count"],
    queryFn: () => withSession(() => payoutCountFn({})),
    enabled: hasSession === true,
    refetchInterval: 15000,
  });
  const pendingUserCount = useQuery({
    queryKey: ["pending-user-count"],
    queryFn: () => withSession(() => userCountFn({})),
    enabled: hasSession === true,
    refetchInterval: 15000,
  });
  const badges = {
    pendingPointRequests: pendingCount.data?.count ?? 0,
    pendingPayouts: pendingPayoutCount.data?.count ?? 0,
    pendingUsers: pendingUserCount.data?.count ?? 0,
  } as const;
  const totalBadges = badges.pendingPointRequests + badges.pendingPayouts + badges.pendingUsers;

  const currentItem =
    GROUPS.flatMap((g) => g.items).find((i) =>
      i.exact
        ? location.pathname === i.to
        : location.pathname.startsWith(i.to) && i.to !== "/management/admin",
    ) ?? GROUPS[0].items[0];

  function NavList({ onPick }: { onPick?: () => void }) {
    return (
      <nav className="space-y-6 px-3 py-4">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <div className="mb-1 px-3 text-[11px] font-medium text-[var(--mgmt-muted)]">{group.label}</div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.exact
                  ? location.pathname === item.to
                  : location.pathname.startsWith(item.to);
                const Icon = item.icon;
                const badge = item.badgeKey ? badges[item.badgeKey] : 0;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={onPick}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-[#E8F0FE] text-[var(--mgmt-accent)]"
                          : "text-[#3c4043] hover:bg-[#F1F3F4]",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 opacity-80" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {badge > 0 && (
                        <span className="rounded-full bg-[var(--mgmt-accent)] px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Desktop left rail — Analytics-style */}
      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[240px] shrink-0 overflow-y-auto border-r border-[var(--mgmt-border)] bg-white lg:block">
        <div className="sticky top-0 z-10 border-b border-[var(--mgmt-border)] bg-white px-5 py-4">
          <div className="text-[13px] font-medium text-[var(--mgmt-ink)]">Operations</div>
          <div className="text-[11px] text-[var(--mgmt-muted)]">
            {totalBadges > 0 ? `${totalBadges} items need attention` : "All queues clear"}
          </div>
        </div>
        <NavList />
      </aside>

      {/* Main canvas */}
      <div className="min-w-0 flex-1">
        {/* Mobile section bar */}
        <div className="sticky top-14 z-20 flex items-center justify-between gap-3 border-b border-[var(--mgmt-border)] bg-white px-4 py-2.5 lg:hidden">
          <div className="min-w-0 text-[13px] font-medium text-[var(--mgmt-ink)]">{currentItem.label}</div>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--mgmt-border)] px-2.5 text-[12px] font-medium"
          >
            <Menu className="h-3.5 w-3.5" />
            Menu
            {totalBadges > 0 && (
              <span className="rounded-full bg-[var(--mgmt-accent)] px-1.5 text-[10px] text-white">{totalBadges}</span>
            )}
          </button>
        </div>

        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-[var(--mgmt-border)] px-4 py-3">
                <span className="text-[14px] font-medium">Navigation</span>
                <button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-[#F1F3F4]">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <NavList onPick={() => setOpen(false)} />
              </div>
            </aside>
          </div>
        )}

        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
