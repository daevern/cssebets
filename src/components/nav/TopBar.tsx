import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Bell, User, Wallet as WalletIcon } from "lucide-react";
import { CsseLogo, BrandText } from "@/components/brand/CsseMark";

export function TopBar({
  balance,
  loading,
  onSignOut: _onSignOut,
}: {
  balance?: number | null;
  loading?: boolean;
  onSignOut?: () => void;
}) {
  const { pathname } = useLocation();
  const router = useRouter();
  // On the Analytics/Match detail page, strip brand chrome and show a back
  // arrow instead — the user already knows where they are.
  const isMatchDetail = /^\/matches\/[^/]+/.test(pathname);

  return (
    <header
      className="sticky top-0 z-30 border-b border-[var(--color-surface-border)]/60 bg-[var(--surface)]/90 backdrop-blur-xl"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
        {isMatchDetail ? (
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.history.back()}
            className="grid h-9 w-9 -ml-2 place-items-center rounded-full text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Link to="/dashboard" aria-label="CSSEBets home" className="flex items-center gap-2">
            <CsseLogo size={22} />
            <span className="hidden xs:inline text-[15px] font-bold tracking-tight leading-none">
              <BrandText />
            </span>
          </Link>
        )}

        <div className="flex items-center gap-2">
          {balance != null && (
            <Link
              to="/wallet"
              className="flex items-center gap-1.5 rounded-full border border-[var(--color-surface-border)] bg-[var(--surface-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--neon)]/40"
            >
              <WalletIcon className="h-3.5 w-3.5 text-[var(--neon)]" />
              <span className="tabular-nums">{loading ? "…" : balance.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
              <span className="text-[10px] font-medium text-[var(--ink-muted)]">PTS</span>
            </Link>
          )}
          {!isMatchDetail && (
            <>
              <Link
                to="/support"
                aria-label="Notifications"
                className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-surface-border)]/70 text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
              >
                <Bell className="h-4 w-4" />
              </Link>
              <Link
                to="/settings"
                aria-label="Profile"
                className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-surface-border)]/70 text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
              >
                <User className="h-4 w-4" />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
