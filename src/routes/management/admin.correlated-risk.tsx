import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/management/admin/correlated-risk")({
  head: () => ({ meta: [{ title: "Correlated risk alerts — cssebets admin" }] }),
  component: CorrelatedRiskPage,
});

type Alert = {
  id: string;
  match_id: string;
  match_label: string | null;
  user_id: string | null;
  user_label: string | null;
  severity: "low" | "medium" | "high" | "critical";
  correlation_group: string;
  related_markets: string[] | null;
  related_outcomes: string[] | null;
  total_stake: number;
  gross_payout: number;
  net_liability: number;
  bet_count: number;
  status: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

const STATUSES = ["open", "stale", "resolved", "dismissed", "all"] as const;

function CorrelatedRiskPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("open");

  const q = useQuery({
    queryKey: ["correlated-alerts", status],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "get_correlated_exposure_alerts",
        { p_status: status === "all" ? null : status },
      );
      if (error) throw error;
      return ((data?.alerts ?? []) as Alert[]);
    },
  });

  const resolve = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { data, error } = await (supabase as any).rpc(
        "resolve_correlated_exposure_alert",
        { p_alert_id: id, p_resolution_note: note },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Alert resolved");
      qc.invalidateQueries({ queryKey: ["correlated-alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alerts = q.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-dashed border-[var(--color-surface-border)] pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--color-neon)]" />
          <div>
            <h1 className="text-[13px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink)]">
              Correlated risk alerts
            </h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)] mt-0.5">
              Phase 8 · pending-bet stacks that can win together
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={
                "text-[9px] font-bold uppercase tracking-[0.24em] px-2 py-1 border " +
                (status === s
                  ? "bg-[var(--color-neon)] text-[var(--color-surface)] border-[var(--color-neon)]"
                  : "border-[var(--color-surface-border)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]")
              }
            >
              {s}
            </button>
          ))}
        </div>
      </header>

      {q.isLoading && (
        <div className="flex items-center gap-2 text-[11px] text-[var(--color-ink-muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading alerts…
        </div>
      )}
      {q.error && (
        <div className="border border-red-500/40 bg-red-500/5 p-3 text-[11px] text-red-300">
          {(q.error as Error).message}
        </div>
      )}
      {!q.isLoading && alerts.length === 0 && (
        <div className="border border-dashed border-[var(--color-surface-border)] p-6 text-center text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
          No {status === "all" ? "" : status} correlated alerts.
        </div>
      )}

      <div className="grid gap-3">
        {alerts.map((a) => (
          <AlertCard key={a.id} a={a} onResolve={(note) => resolve.mutate({ id: a.id, note })} />
        ))}
      </div>

      <p className="text-[10px] text-[var(--color-ink-muted)] uppercase tracking-[0.18em] border-t border-dashed border-[var(--color-surface-border)] pt-3">
        Phase 8 — detection only. Settlement, wallet balances, prediction status, odds, and
        accounting were not changed.
      </p>
    </div>
  );
}

const SEV_COLORS: Record<string, string> = {
  critical: "bg-red-500 text-white",
  high: "bg-orange-500 text-black",
  medium: "bg-yellow-400 text-black",
  low: "bg-[var(--color-surface)] text-[var(--color-ink-muted)] border border-[var(--color-surface-border)]",
};

function AlertCard({ a, onResolve }: { a: Alert; onResolve: (note: string) => void }) {
  const [note, setNote] = useState("");
  const [showResolve, setShowResolve] = useState(false);

  return (
    <article className="relative border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span
          className={
            "text-[9px] font-bold uppercase tracking-[0.24em] px-1.5 py-0.5 " +
            (SEV_COLORS[a.severity] ?? SEV_COLORS.low)
          }
        >
          {a.severity}
        </span>
        <code className="text-[10px] text-[var(--color-neon)] bg-[var(--color-surface)] px-1.5 py-0.5">
          {a.correlation_group}
        </code>
        <span className="text-[11px] font-bold text-[var(--color-ink)]">
          {a.match_label ?? a.match_id.slice(0, 8)}
        </span>
        {a.user_id ? (
          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            · user: {a.user_label ?? a.user_id.slice(0, 8)}
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-neon)]">
            · platform-wide
          </span>
        )}
        <span
          className={
            "ml-auto text-[9px] font-bold uppercase tracking-[0.24em] px-1.5 py-0.5 border " +
            (a.status === "open"
              ? "border-yellow-500/40 text-yellow-300"
              : a.status === "resolved"
                ? "border-emerald-500/40 text-emerald-300"
                : "border-[var(--color-surface-border)] text-[var(--color-ink-muted)]")
          }
        >
          {a.status}
        </span>
      </div>

      <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
        <Metric label="Total stake" value={fmt(a.total_stake)} />
        <Metric label="Gross payout" value={fmt(a.gross_payout)} />
        <Metric label="Net liability" value={fmt(a.net_liability)} strong />
        <Metric label="Bet count" value={String(a.bet_count ?? 0)} />
      </dl>

      <div className="mt-3 grid gap-2 text-[10px]">
        <div>
          <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
            Related markets:
          </span>{" "}
          <span className="font-mono text-[var(--color-ink)]">
            {(a.related_markets ?? []).join(", ") || "—"}
          </span>
        </div>
        <div>
          <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
            Related outcomes:
          </span>{" "}
          <span className="font-mono text-[var(--color-ink)]">
            {(a.related_outcomes ?? []).join(", ") || "—"}
          </span>
        </div>
        <div className="text-[var(--color-ink-muted)]">
          created {new Date(a.created_at).toLocaleString()} · updated{" "}
          {new Date(a.updated_at).toLocaleString()}
          {a.resolution_note ? ` · note: ${a.resolution_note}` : ""}
        </div>
      </div>

      {a.status !== "resolved" && (
        <div className="mt-3 border-t border-dashed border-[var(--color-surface-border)] pt-3">
          {!showResolve ? (
            <button
              onClick={() => setShowResolve(true)}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-neon)] hover:underline"
            >
              <ShieldCheck className="h-3 w-3" /> Resolve
            </button>
          ) : (
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Resolution note (required)"
                className="flex-1 bg-[var(--color-surface)] border border-[var(--color-surface-border)] px-2 py-1.5 text-[11px] text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-neon)]"
              />
              <button
                disabled={!note.trim()}
                onClick={() => onResolve(note.trim())}
                className="text-[10px] font-bold uppercase tracking-[0.24em] px-3 py-1.5 bg-[var(--color-neon)] text-[var(--color-surface)] disabled:opacity-40"
              >
                Confirm
              </button>
              <button
                onClick={() => {
                  setShowResolve(false);
                  setNote("");
                }}
                className="text-[10px] font-bold uppercase tracking-[0.24em] px-3 py-1.5 border border-[var(--color-surface-border)] text-[var(--color-ink-muted)]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[9px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
        {label}
      </dt>
      <dd
        className={
          "font-mono " +
          (strong ? "text-[13px] text-[var(--color-neon)]" : "text-[12px] text-[var(--color-ink)]")
        }
      >
        {value}
      </dd>
    </div>
  );
}

function fmt(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
