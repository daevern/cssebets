import { Link } from "@tanstack/react-router";
import { Bell, User, Wallet as WalletIcon } from "lucide-react";
import { CsseLogo, BrandText } from "@/components/brand/CsseMark";
import { TokenChip } from "@/components/engagement/TokenVault";


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
      className="sticky top-0 z-30 overflow-hidden border-b border-[var(--color-surface-border)]/60 bg-[var(--surface)]/90 backdrop-blur-xl"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex h-14 w-full min-w-0 max-w-md items-center justify-between gap-2 px-3 sm:px-4">
        <Link
          to="/dashboard"
          aria-label="CSSEBets home"
          className="flex shrink-0 items-center gap-2"
        >
          <CsseLogo size={22} />
          <span className="hidden sm:inline text-[15px] font-bold tracking-tight leading-none">
            <BrandText />
          </span>
        </Link>

        <div className="flex min-w-0 shrink items-center justify-end gap-1 sm:gap-2">
          {balance != null && (
            <Link
              to="/wallet"
              className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-surface-border)] bg-[var(--surface-2)] px-2 py-1.5 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--neon)]/40 sm:gap-1.5 sm:px-3"
            >
              <WalletIcon className="h-3.5 w-3.5 shrink-0 text-[var(--neon)]" />
              <span className="tabular-nums">{loading ? "…" : balance.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
              <span className="hidden sm:inline text-[10px] font-medium text-[var(--ink-muted)]">PTS</span>
            </Link>
          )}
          {balance != null && <TokenChip />}
          <Link
            to="/notifications"
            aria-label="Notifications"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--color-surface-border)]/70 text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)] sm:h-9 sm:w-9"
          >
            <Bell className="h-4 w-4" />
          </Link>
          <Link
            to="/settings"
            aria-label="Profile"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--color-surface-border)]/70 text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)] sm:h-9 sm:w-9"
          >
            <User className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
