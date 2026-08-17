import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageShell, StencilPanel } from "@/components/ui/page-shell";
import { IconShield, IconTimeline } from "@/components/trust/TrustIcons";
import { BrandText } from "@/components/brand/CsseMark";
import { ActivityFeed } from "@/components/trust/ActivityFeed";
import {
  getPlatformPulse,
  getPayoutPerformance,
  getPlatformStatus,
} from "@/lib/trust.functions";

export const Route = createFileRoute("/_authenticated/trust-center")({
  head: () => ({
    meta: [
      { title: "Trust Center — cssebets" },
      { name: "description", content: "How CSSEBets handles points, bets, payouts, and security. Maintained by the CSSEBets team." },
    ],
  }),
  component: TrustCenter,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <StencilPanel kicker={<><IconShield className="h-3 w-3" /> {title}</>}>
      <div className="space-y-3 text-sm leading-relaxed text-[var(--color-ink)]">
        {children}
      </div>
    </StencilPanel>
  );
}

function LiveStrip() {
  const pulseFn = useServerFn(getPlatformPulse);
  const payoutFn = useServerFn(getPayoutPerformance);
  const statusFn = useServerFn(getPlatformStatus);

  const pulse = useQuery({
    queryKey: ["trust-pulse"],
    queryFn: () => pulseFn({}),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const payout = useQuery({
    queryKey: ["trust-payout-perf"],
    queryFn: () => payoutFn({}),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const status = useQuery({
    queryKey: ["trust-platform-status"],
    queryFn: () => statusFn({}),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const members = pulse.data?.registered_members;
  const bets = pulse.data?.bets_placed ?? payout.data?.bets_placed;
  const hours = pulse.data?.avg_payout_processing_hours;
  const services = status.data ?? [];
  const worst =
    services.find((s) => s.status === "offline") ??
    services.find((s) => s.status === "degraded") ??
    services.find((s) => s.status === "operational") ??
    null;
  const statusLabel = worst
    ? worst.status === "operational"
      ? "All systems go"
      : worst.status === "degraded"
        ? "Degraded"
        : worst.status === "offline"
          ? "Offline"
          : "Unknown"
    : status.isLoading
      ? "…"
      : "Unknown";
  const statusTone =
    worst?.status === "operational"
      ? "text-[var(--color-neon)]"
      : worst?.status === "degraded"
        ? "text-amber-400"
        : worst?.status === "offline"
          ? "text-rose-400"
          : "text-[var(--color-ink-muted)]";

  const fmt = (n: number | null | undefined) =>
    n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toLocaleString();

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StripStat label="Members" value={pulse.isLoading ? "…" : fmt(members)} />
      <StripStat label="Bets placed" value={pulse.isLoading && payout.isLoading ? "…" : fmt(bets)} />
      <StripStat
        label="Payout hours"
        value={
          pulse.isLoading
            ? "…"
            : hours == null
              ? "—"
              : `${Number(hours).toFixed(1)}h`
        }
      />
      <StripStat label="Platform" value={statusLabel} valueClassName={statusTone} />
    </div>
  );
}

function StripStat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] px-3 py-2.5">
      <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
        {label}
      </div>
      <div
        className={`mt-1 font-display text-base font-bold tabular-nums tracking-tight ${
          valueClassName ?? "text-[var(--color-ink)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function TrustCenter() {
  return (
    <PageShell
      kicker="Trust Center"
      title="How we operate,"
      titleAccent="in plain English."
      wide
    >
      <LiveStrip />

      <ActivityFeed />

      <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
        This page is maintained by the <BrandText /> team to answer common questions about
        how we handle points, bets, payouts, and security. It is not an independent
        certification — it is our own description of how the platform works today.
      </p>

      <Section title="Our commitment">
        <p>We focus on a few things every day:</p>
        <ul className="list-disc space-y-1.5 pl-5 text-[var(--color-ink-muted)]">
          <li><span className="text-[var(--color-ink)]">Transparent odds</span> — every selection shows the reference odds used at the moment your bet is placed.</li>
          <li><span className="text-[var(--color-ink)]">Manual review</span> — every point request and every payout request is reviewed by a real person.</li>
          <li><span className="text-[var(--color-ink)]">Secure account handling</span> — sessions, passwords, and account changes go through our authentication provider.</li>
          <li><span className="text-[var(--color-ink)]">Fair settlement</span> — bets are settled against the official result of the match.</li>
        </ul>
      </Section>

      <Section title="How points work">
        <p>
          Points are the internal unit used to place bets on <BrandText />. They are not
          a cryptocurrency or a publicly traded asset.
        </p>
        <ol className="list-decimal space-y-1.5 pl-5 text-[var(--color-ink-muted)]">
          <li>You submit a <span className="text-[var(--color-ink)]">point request</span> with proof of your transfer.</li>
          <li>An admin reviews the request and either approves it or requests more info.</li>
          <li>Approved points are credited to your wallet and visible in your balance immediately.</li>
          <li>You stake points on bets; winning bets credit your wallet automatically.</li>
        </ol>
      </Section>

      <Section title="Settlement policy">
        <ul className="list-disc space-y-1.5 pl-5 text-[var(--color-ink-muted)]">
          <li>Matches are settled once the final result is available from the data feed.</li>
          <li>If a match is voided or cancelled, affected bets are refunded at original stake.</li>
          <li>If an event is suspended or postponed beyond a reasonable window, bets are voided and refunded.</li>
          <li>Settlement is automated; flagged bets are reviewed manually before payout.</li>
        </ul>
      </Section>

      <Section title="Payout policy">
        <ul className="list-disc space-y-1.5 pl-5 text-[var(--color-ink-muted)]">
          <li>Withdraw using the Payout page. We collect the bank details needed to process the transfer.</li>
          <li>An admin verifies the request, processes the transfer, and uploads proof.</li>
          <li>You confirm receipt — or flag a problem — directly in the app.</li>
          <li>Typical processing time is shown on the Payout page based on real recent history.</li>
        </ul>
      </Section>

      <Section title="Responsible play">
        <p>
          Only bet what you can afford to lose. Set yourself limits. If betting stops
          feeling like a game, step away — your wallet, picks, and history will still
          be here when you return. Contact support any time you need help.
        </p>
      </Section>

      <StencilPanel kicker={<><IconTimeline className="h-3 w-3" /> Need anything else?</>}>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Open a support ticket from the Support tab. Most messages get a reply
          within the response window shown on the Support page.
        </p>
      </StencilPanel>
    </PageShell>
  );
}
