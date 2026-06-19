import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPlatformStatus } from "@/lib/trust.functions";
import { IconBroadcast } from "@/components/trust/TrustIcons";
import { UpdatedLive } from "@/components/trust/EmptyState";

const TONE: Record<string, { dot: string; label: string; chip: string }> = {
  operational: {
    dot: "bg-[var(--color-neon)]",
    label: "Operational",
    chip: "border-[var(--color-neon)]/40 text-[var(--color-neon)]",
  },
  degraded: {
    dot: "bg-amber-400",
    label: "Degraded",
    chip: "border-amber-400/40 text-amber-300",
  },
  offline: {
    dot: "bg-rose-500",
    label: "Offline",
    chip: "border-rose-500/40 text-rose-400",
  },
  unknown: {
    dot: "bg-[var(--color-ink-muted)]",
    label: "No recent check",
    chip: "border-[var(--color-surface-border)] text-[var(--color-ink-muted)]",
  },
};

function rel(iso: string | null) {
  if (!iso) return "no recent check";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}

export function StatusGrid() {
  const fn = useServerFn(getPlatformStatus);
  const q = useQuery({
    queryKey: ["trust", "status"],
    queryFn: () => fn({}),
    staleTime: 30_000,
    refetchInterval: 45_000,
  });

  const services = q.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
          <IconBroadcast className="h-3 w-3" /> Live service status
        </span>
        {q.dataUpdatedAt ? <UpdatedLive at={q.dataUpdatedAt} /> : null}
      </div>
      <ul className="divide-y divide-dashed divide-[var(--color-surface-border)] border border-[var(--color-surface-border)] bg-[var(--color-surface-2)]">
        {services.map((s) => {
          const t = TONE[s.status] ?? TONE.unknown;
          return (
            <li key={s.service} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${t.dot}`} />
                <span className="truncate text-sm font-bold uppercase tracking-wide text-[var(--color-ink)]">
                  {s.service}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden md:inline text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                  Last check {rel(s.last_checked)}
                </span>
                <span className={`inline-flex items-center border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em] ${t.chip}`}>
                  {t.label}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
        Status is derived from real health checks in the last 2 hours. We do not publish synthetic uptime figures.
      </p>
    </div>
  );
}
