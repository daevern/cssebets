import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, BookOpen } from "lucide-react";

export const Route = createFileRoute("/management/admin/market-rules")({
  head: () => ({ meta: [{ title: "Market rules — cssebets admin" }] }),
  component: MarketRulesPage,
});

type MarketRule = {
  id: string;
  market_key: string;
  market_aliases: string[] | null;
  display_name: string;
  category: string;
  settlement_basis: string;
  data_required: string[] | null;
  void_conditions: string[] | null;
  supported_outcomes: string[] | null;
  is_scoreline_dependent: boolean;
  is_stat_dependent: boolean;
  is_active: boolean;
  risk_notes: string | null;
  user_facing_note: string | null;
  audit_notes: string | null;
  updated_at: string;
};

function MarketRulesPage() {
  const q = useQuery({
    queryKey: ["admin-market-rules"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("market_rules")
        .select("*")
        .order("category", { ascending: true })
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MarketRule[];
    },
  });

  const grouped = (q.data ?? []).reduce<Record<string, MarketRule[]>>((acc, r) => {
    (acc[r.category] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 border-b border-dashed border-[var(--color-surface-border)] pb-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-[var(--color-neon)]" />
          <div>
            <h1 className="text-[13px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink)]">
              Market rules
            </h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)] mt-0.5">
              Read-only catalog · Phase 9 foundation
            </p>
          </div>
        </div>
        <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)] border border-[var(--color-surface-border)] px-2 py-1">
          {q.data?.length ?? 0} rules
        </span>
      </header>

      {q.isLoading && (
        <div className="flex items-center gap-2 text-[11px] text-[var(--color-ink-muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading market rules…
        </div>
      )}
      {q.error && (
        <div className="border border-red-500/40 bg-red-500/5 p-3 text-[11px] text-red-300">
          Failed to load market rules: {(q.error as Error).message}
        </div>
      )}

      {Object.entries(grouped).map(([category, rules]) => (
        <section key={category} className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 bg-[var(--color-neon)] shadow-[0_0_8px_var(--color-neon-glow)]" />
            <h2 className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
              {category}
            </h2>
            <span className="flex-1 border-t border-dashed border-[var(--color-surface-border)]" />
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
              {rules.length}
            </span>
          </div>

          <div className="grid gap-3">
            {rules.map((r) => (
              <article
                key={r.id}
                className="relative border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-3"
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--color-ink)]">
                    {r.display_name}
                  </span>
                  <code className="text-[10px] text-[var(--color-neon)] bg-[var(--color-surface)] px-1.5 py-0.5">
                    {r.market_key}
                  </code>
                  {(r.market_aliases ?? []).length > 0 &&
                    (r.market_aliases ?? []).map((a) => (
                      <code
                        key={a}
                        className="text-[9px] text-[var(--color-ink-muted)] bg-[var(--color-surface)] px-1.5 py-0.5 border border-[var(--color-surface-border)]"
                      >
                        alias: {a}
                      </code>
                    ))}
                  <span
                    className={
                      "ml-auto text-[9px] font-bold uppercase tracking-[0.24em] px-1.5 py-0.5 " +
                      (r.is_active
                        ? "bg-[var(--color-neon)] text-[var(--color-surface)]"
                        : "border border-[var(--color-surface-border)] text-[var(--color-ink-muted)]")
                    }
                  >
                    {r.is_active ? "active" : "inactive"}
                  </span>
                </div>

                <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                  <Field label="Settlement basis" value={r.settlement_basis} />
                  <Field
                    label="Supported outcomes"
                    value={(r.supported_outcomes ?? []).join(", ") || "—"}
                    mono
                  />
                  <Field label="Data required" value={(r.data_required ?? []).join(", ") || "—"} mono />
                  <Field
                    label="Void conditions"
                    value={(r.void_conditions ?? []).join(" · ") || "—"}
                  />
                  <Field
                    label="Scoreline dependent"
                    value={r.is_scoreline_dependent ? "yes" : "no"}
                  />
                  <Field label="Stat dependent" value={r.is_stat_dependent ? "yes" : "no"} />
                  {r.risk_notes && <Field label="Risk notes" value={r.risk_notes} full />}
                  {r.user_facing_note && (
                    <Field label="User-facing note" value={r.user_facing_note} full />
                  )}
                </dl>
              </article>
            ))}
          </div>
        </section>
      ))}

      <p className="text-[10px] text-[var(--color-ink-muted)] uppercase tracking-[0.18em] border-t border-dashed border-[var(--color-surface-border)] pt-3">
        Phase 9 — this catalog is documentation only. Settlement, wallet, accounting, and risk
        code continue to run from their existing logic and were not changed.
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  full,
}: {
  label: string;
  value: string;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <dt className="text-[9px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)] mb-0.5">
        {label}
      </dt>
      <dd
        className={
          "text-[var(--color-ink)] " +
          (mono ? "font-mono text-[10px] break-all" : "text-[11px] leading-snug")
        }
      >
        {value}
      </dd>
    </div>
  );
}
