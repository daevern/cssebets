import type { ReactNode } from "react";

export function EmptyState({ icon, message }: { icon?: ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
      {icon && (
        <div className="text-[var(--color-neon)]/60">{icon}</div>
      )}
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
        {message}
      </p>
    </div>
  );
}

export function UpdatedLive({ at }: { at: number | Date | string }) {
  const d = at instanceof Date ? at : new Date(at);
  const diff = (Date.now() - d.getTime()) / 1000;
  const rel =
    diff < 30 ? "Updated live · just now"
    : diff < 90 ? "Updated live · moments ago"
    : diff < 3600 ? `Updated live · ${Math.round(diff / 60)}m ago`
    : `Updated live · ${Math.round(diff / 3600)}h ago`;
  return (
    <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
      <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-neon)]" />
      {rel}
    </span>
  );
}
