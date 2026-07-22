import { Link, useLocation } from "@tanstack/react-router";
import { Bell, User, Home, LineChart, Activity, Coins, Headphones } from "lucide-react";

import { CsseLogo } from "@/components/brand/CsseMark";
import { useAuth } from "@/hooks/use-auth";
import { TokenChip } from "@/components/engagement/TokenVault";
import { WalletChip } from "@/components/wallet/WalletCard";
import { CategoryRail } from "@/components/nav/CategoryRail";
import { HamburgerMenu } from "@/components/nav/HamburgerMenu";


const DESKTOP_NAV = [
  { to: "/dashboard", label: "Home", icon: Home, exact: true },
  { to: "/matches", label: "Markets", icon: LineChart, exact: false },
  { to: "/my-predictions", label: "Picks", icon: Activity, exact: false },
  { to: "/payout", label: "Payout", icon: Coins, exact: false },
  { to: "/support", label: "Support", icon: Headphones, exact: false },
] as const;

export function TopBar({
  balance,
  loading,
  onSignOut: _onSignOut,
}: {
  balance?: number | null;
  loading?: boolean;
  onSignOut?: () => void;
}) {
  return (
    <header
      className="sticky top-0 z-30 overflow-hidden border-b border-[var(--color-surface-border)]/60 bg-[var(--surface)]/95 backdrop-blur-md"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Mobile layout — unchanged */}
      <MobileBar balance={balance} loading={loading} />
      {/* Desktop layout — spacious, inline primary nav */}
      <DesktopBar balance={balance} loading={loading} />
      {/* Kalshi-style category ribbon under the top nav */}
      <CategoryRail />
    </header>

  );
}

function MobileBar({ balance: _balance, loading: _loading }: { balance?: number | null; loading?: boolean }) {
  const { user } = useAuth();
  const isGuest = !user || (user as any)?.is_anonymous === true;
  return (
    <div className="mx-auto flex h-14 w-full min-w-0 max-w-md items-center justify-between gap-2 px-3 sm:px-4 md:hidden">
      <Link
        to="/dashboard"
        aria-label="CSSEBets home"
        className="flex shrink-0 items-center gap-2"
      >
        <CsseLogo size={22} />
      </Link>

      <div className="flex min-w-0 shrink items-center justify-end gap-1 sm:gap-2">
        {isGuest && (
          <Link
            to="/auth"
            className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--neon)]/60 bg-[var(--neon)]/10 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--neon)] transition-colors hover:bg-[var(--neon)]/20"
          >
            <LogIn className="h-3.5 w-3.5" />
            Log in
          </Link>
        )}
        <HamburgerMenu />
      </div>
    </div>
  );
}


function DesktopBar({ balance, loading }: { balance?: number | null; loading?: boolean }) {
  const { pathname } = useLocation();
  return (
    <div className="mx-auto hidden h-16 w-full max-w-7xl items-center gap-8 px-8 md:flex lg:h-[68px] lg:px-10">
      {/* Brand */}
      <Link
        to="/dashboard"
        aria-label="CSSEBets home"
        className="group flex shrink-0 items-center gap-2.5"
      >
        <CsseLogo size={26} />
      </Link>

      {/* Divider */}
      <span aria-hidden className="h-6 w-px shrink-0 bg-[var(--color-surface-border)]/70" />

      {/* Primary nav */}
      <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-1">
        {DESKTOP_NAV.map((it) => {
          const Icon = it.icon;
          const active = it.exact
            ? pathname === it.to
            : pathname === it.to || pathname.startsWith(it.to + "/");
          return (
            <Link
              key={it.to}
              to={it.to}
              className={`relative flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold tracking-tight transition-colors ${
                active
                  ? "text-[var(--ink)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-[var(--neon)] stroke-[2.4]" : ""}`} />
              <span>{it.label}</span>
              {active && (
                <span
                  aria-hidden
                  className="absolute inset-x-3.5 -bottom-[9px] h-[2px] rounded-full bg-[var(--neon)]"
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-3">
        {balance != null && <WalletChip balance={balance} loading={loading} />}
        {balance != null && <TokenChip />}

        <span aria-hidden className="h-6 w-px bg-[var(--color-surface-border)]/70" />

        <Link
          to="/notifications"
          aria-label="Notifications"
          className="grid h-10 w-10 place-items-center rounded-full border border-[var(--color-surface-border)]/70 text-[var(--ink-muted)] transition-colors hover:border-[var(--neon)]/40 hover:text-[var(--ink)]"
        >
          <Bell className="h-[18px] w-[18px]" />
        </Link>
        <Link
          to="/settings"
          aria-label="Profile"
          className="grid h-10 w-10 place-items-center rounded-full border border-[var(--color-surface-border)]/70 text-[var(--ink-muted)] transition-colors hover:border-[var(--neon)]/40 hover:text-[var(--ink)]"
        >
          <User className="h-[18px] w-[18px]" />
        </Link>
      </div>
    </div>
  );
}
