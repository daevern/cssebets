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
  Radio,
  Database,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/management/admin")({
  head: () => ({ meta: [{ title: "Admin — cssebets" }] }),
  component: AdminLayout,
});

type BadgeKey = "pendingPointRequests" | "pendingPayouts" | "pendingUsers";
type NavItem = { to: string; label: string; icon: any; exact?: boolean; badgeKey?: BadgeKey };
type NavGroup = { label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    label: "Live ops",
    items: [
      { to: "/management/admin", label: "Overview", icon: LayoutDashboard, exact: true },
      { to: "/management/admin/operations", label: "Operations", icon: Activity },
      { to: "/management/admin/incidents", label: "Incidents", icon: GitBranch },
      { to: "/management/admin/alerts", label: "Alerts", icon: Bell },
      { to: "/management/admin/health", label: "Health", icon: Stethoscope },
      { to: "/management/admin/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Settlement",
    items: [
      { to: "/management/admin/settlements", label: "Settlements", icon: ClipboardList },
      { to: "/management/admin/predictions", label: "Predictions", icon: ListChecks },
      { to: "/management/admin/matches", label: "Matches", icon: CalendarDays },
      { to: "/management/admin/tournament", label: "Tournament", icon: Shield },
      { to: "/management/admin/odds-history", label: "Odds history", icon: TrendingUp },
      { to: "/management/admin/odds-provider", label: "Odds provider", icon: Database },
      { to: "/management/admin/pricing-breakdown", label: "Pricing", icon: ShieldAlert },
    ],
  },
  {
    label: "Finance & risk",
    items: [
      { to: "/management/admin/points", label: "Point requests", icon: Wallet, badgeKey: "pendingPointRequests" },
      { to: "/management/admin/payouts", label: "Payouts", icon: Banknote, badgeKey: "pendingPayouts" },
      { to: "/management/admin/wallet-adjustments", label: "Wallet adjustments", icon: Wallet },
      { to: "/management/admin/wallet-ledger", label: "Wallet ledger", icon: Wallet },
      { to: "/management/admin/bankroll", label: "Bankroll", icon: TrendingUp },
      { to: "/management/admin/match-pools", label: "Match pools", icon: Wallet },
      { to: "/management/admin/risk-settings", label: "Risk settings", icon: ShieldAlert },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/management/admin/users", label: "Users", icon: Users, badgeKey: "pendingUsers" },
      { to: "/management/admin/staff", label: "Staff", icon: Shield },
      { to: "/management/admin/support-ops", label: "Support ops", icon: Activity },
      { to: "/management/admin/onboarding", label: "Onboarding", icon: BookOpen },
    ],
  },
  {
    label: "Governance",
    items: [
      { to: "/management/admin/review", label: "Action review", icon: ScrollText },
      { to: "/management/admin/audit", label: "Audit", icon: ScrollText },
      { to: "/management/admin/market-rules", label: "Market rules", icon: BookOpen },
      { to: "/management/admin/correlated-risk", label: "Correlated risk", icon: ShieldAlert },
      { to: "/management/admin/reconciliation", label: "Reconciliation", icon: ShieldAlert },
      { to: "/management/admin/simulation", label: "Simulation", icon: ShieldAlert },
      { to: "/management/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];


function AdminLayout() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Lock body scroll while drawer is open (mobile)
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
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
    refetchOnWindowFocus: true,
  });
  const pendingPayoutCount = useQuery({
    queryKey: ["pending-payout-count"],
    queryFn: () => withSession(() => payoutCountFn({})),
    enabled: hasSession === true,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const pendingUserCount = useQuery({
    queryKey: ["pending-user-count"],
    queryFn: () => withSession(() => userCountFn({})),
    enabled: hasSession === true,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const badges = {
    pendingPointRequests: pendingCount.data?.count ?? 0,
    pendingPayouts: pendingPayoutCount.data?.count ?? 0,
    pendingUsers: pendingUserCount.data?.count ?? 0,
  } as const;

  const totalBadges = badges.pendingPointRequests + badges.pendingPayouts + badges.pendingUsers;

  // Find current page label for mobile breadcrumb
  const currentItem = GROUPS.flatMap((g) => g.items).find((i) =>
    i.exact ? location.pathname === i.to : location.pathname.startsWith(i.to) && i.to !== "/management/admin"
  ) ?? GROUPS[0].items[0];

  function NavList({ onPick }: { onPick?: () => void }) {
    return (
      <div className="space-y-5">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-2 pb-2 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
              <span className="h-px flex-1 bg-[var(--color-surface-border)]" />
              <span>{group.label}</span>
              <span className="h-px flex-1 bg-[var(--color-surface-border)]" />
            </div>
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
                        "group relative flex items-center gap-2 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] transition-colors border border-transparent",
                        active
                          ? "border-[var(--color-neon)]/40 bg-[var(--color-surface-2)] text-[var(--color-neon)]"
                          : "text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]",
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-[var(--color-neon)]"
                        />
                      )}
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {badge > 0 && (
                        <span className="inline-flex min-w-[18px] h-[16px] items-center justify-center bg-[var(--color-neon)] px-1 text-[9px] font-bold text-[var(--color-surface)] tabular-nums">
                          {badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="md:flex md:gap-5 md:min-h-[calc(100vh-7rem)]">
      {/* Mobile current-section bar + menu trigger */}
      <div className="md:hidden sticky top-[6.5rem] z-20 -mx-3 mb-3 border-y border-[var(--color-surface-border)] bg-[var(--color-surface)]/95 backdrop-blur px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Radio className="h-3 w-3 text-[var(--color-neon)] shrink-0" />
          <span className="text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)] shrink-0">Admin</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink)] truncate">/ {currentItem.label}</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="relative inline-flex items-center gap-1.5 border border-[var(--color-neon)]/40 bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon)]"
          aria-label="Open admin menu"
        >
          <Menu className="h-3.5 w-3.5" />
          Menu
          {totalBadges > 0 && (
            <span className="absolute -top-1.5 -right-1.5 inline-flex min-w-[16px] h-[16px] items-center justify-center bg-[var(--color-neon)] px-1 text-[9px] font-bold text-[var(--color-surface)] tabular-nums">
              {totalBadges > 99 ? "99+" : totalBadges}
            </span>
          )}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 right-0 w-[86%] max-w-sm bg-[var(--color-surface)] border-l border-[var(--color-neon)]/30 flex flex-col">
            <div className="flex items-center justify-between border-b border-dashed border-[var(--color-surface-border)] px-4 py-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-[var(--color-neon)]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">Admin console</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 text-[var(--color-ink-muted)] hover:text-[var(--color-neon)]"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <NavList onPick={() => setOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:block md:sticky md:top-20 md:self-start md:w-60 md:shrink-0 md:max-h-[calc(100vh-6rem)] md:overflow-y-auto">
        <div className="relative border border-[var(--color-surface-border)] bg-[var(--color-surface-2)]">
          <span aria-hidden className="pointer-events-none absolute top-0 left-0 h-3 w-3 border-t border-l border-[var(--color-neon)]" />
          <span aria-hidden className="pointer-events-none absolute top-0 right-0 h-3 w-3 border-t border-r border-[var(--color-neon)]" />
          <span aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b border-l border-[var(--color-neon)]" />
          <span aria-hidden className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b border-r border-[var(--color-neon)]" />
          <div className="flex items-center justify-between border-b border-dashed border-[var(--color-surface-border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[var(--color-neon)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">Admin</span>
            </div>
            {totalBadges > 0 && (
              <span className="inline-flex min-w-[18px] h-[16px] items-center justify-center bg-[var(--color-neon)] px-1 text-[9px] font-bold text-[var(--color-surface)] tabular-nums">
                {totalBadges > 99 ? "99+" : totalBadges}
              </span>
            )}
          </div>
          <div className="px-2 py-3">
            <NavList />
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
