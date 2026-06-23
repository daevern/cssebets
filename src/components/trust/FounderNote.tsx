import { StencilPanel } from "@/components/ui/page-shell";
import { IconShield } from "@/components/trust/TrustIcons";
import { Link } from "@tanstack/react-router";
import { BrandText } from "@/components/brand/CsseMark";

export function FounderNote() {
  return (
    <StencilPanel
      kicker={<><IconShield className="h-3 w-3" /> Building for the long run</>}
      accent
    >
      <p className="text-sm leading-relaxed text-[var(--color-ink)]">
        <BrandText /> is growing one member at a time. We focus on transparent operations,
        fair settlements, responsive support, and continuous improvement.
        Thank you for being part of the journey.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/trust-center"
          className="inline-flex items-center gap-1.5 border border-[var(--color-neon)]/40 bg-[var(--color-neon)]/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-neon)] hover:bg-[var(--color-neon)]/10"
        >
          Trust Center
        </Link>
        <Link
          to="/status"
          className="inline-flex items-center gap-1.5 border border-dashed border-[var(--color-surface-border)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)] hover:border-[var(--color-neon)] hover:text-[var(--color-neon)]"
        >
          Platform Status
        </Link>
        <Link
          to="/changelog"
          className="inline-flex items-center gap-1.5 border border-dashed border-[var(--color-surface-border)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)] hover:border-[var(--color-neon)] hover:text-[var(--color-neon)]"
        >
          Changelog
        </Link>
      </div>
    </StencilPanel>
  );
}
