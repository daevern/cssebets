import { createFileRoute } from "@tanstack/react-router";
import { PageShell, StencilPanel } from "@/components/ui/page-shell";
import { IconChangelog } from "@/components/trust/TrustIcons";
import { CHANGELOG, type ChangelogEntry } from "@/content/changelog";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/changelog")({
  head: () => ({
    meta: [
      { title: "Changelog — cssebets" },
      { name: "description", content: "Every CSSEBets release, fix, and improvement. We ship continuously." },
    ],
  }),
  component: ChangelogPage,
});

const TYPE_TONE: Record<ChangelogEntry["type"], string> = {
  feature: "border-[var(--color-neon)]/50 text-[var(--color-neon)]",
  improvement: "border-sky-400/40 text-sky-300",
  fix: "border-amber-400/40 text-amber-300",
};

function monthLabel(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function ChangelogPage() {
  const grouped = useMemo(() => {
    const byMonth = new Map<string, ChangelogEntry[]>();
    for (const e of CHANGELOG) {
      const k = monthLabel(e.date);
      if (!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k)!.push(e);
    }
    return Array.from(byMonth.entries());
  }, []);

  return (
    <PageShell kicker="What's new" title="The" titleAccent="Changelog" wide>
      <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
        We ship continuously. Every feature, fix, and improvement is recorded here.
      </p>
      {grouped.map(([month, entries]) => (
        <section key={month} className="space-y-3">
          <h2 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
            <IconChangelog className="h-3 w-3" /> {month}
          </h2>
          {entries.map((e, i) => (
            <StencilPanel
              key={`${month}-${i}`}
              kicker={
                <span className={`inline-flex items-center border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.22em] ${TYPE_TONE[e.type]}`}>
                  {e.type}
                </span>
              }
              meta={new Date(e.date + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short" })}
            >
              <h3 className="font-display text-base font-bold leading-tight tracking-tight text-[var(--color-ink)]">
                {e.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                {e.body}
              </p>
            </StencilPanel>
          ))}
        </section>
      ))}
    </PageShell>
  );
}
