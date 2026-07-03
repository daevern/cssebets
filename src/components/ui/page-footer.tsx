import { Link } from "@tanstack/react-router";
import { CsseLogo, BrandText } from "@/components/brand/CsseMark";

/* Shared page footer — mirrors the PageShell footer used across
   wallet/payout/picks, so home & matches feel part of the same product. */
export function PageFooter({ className = "" }: { className?: string }) {
  return (
    <footer
      className={`mt-6 flex items-center justify-between border-t border-dashed border-[var(--color-surface-border)] pt-5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)] ${className}`}
    >
      <Link to="/dashboard" className="flex items-center gap-2 hover:text-[var(--color-ink)]">
        <CsseLogo size={16} />
      </Link>
      <span>© {new Date().getFullYear()} <BrandText /></span>
    </footer>
  );
}
