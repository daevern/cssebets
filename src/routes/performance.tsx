import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PublicShell } from "@/routes/about";
import { BrandText } from "@/components/brand/CsseMark";
import {
  PayoutPerformanceSection,
  CommunityGrowthSection,
} from "@/components/landing/TrustSections";
import { getPublicPayoutPerformance } from "@/lib/trust-public.functions";

export const Route = createFileRoute("/performance")({
  head: () => ({
    meta: [
      { title: "Performance — CSSEBets" },
      { name: "description", content: "How CSSEBets performs — settlement speed, payout timelines, platform health and live activity." },
      { property: "og:title", content: "CSSEBets performance" },
      { property: "og:description", content: "How CSSEBets performs — settlement speed, payout timelines, platform health and live activity." },
          { property: "og:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://cssebets.com/performance" }],
  }),
  component: PerformancePage,
});

function PerformancePage() {
  const perfFn = useServerFn(getPublicPayoutPerformance);
  const perf = useQuery({
    queryKey: ["public", "payout-perf-page"],
    queryFn: () => perfFn({}),
    staleTime: 60_000,
  });
  const d = perf.data;
  const success =
    d?.payout_success_rate != null
      ? `${Math.round(Number(d.payout_success_rate) * 100)}%`
      : null;

  return (
    <PublicShell title="Performance" kicker="Reliability & speed">
      <p>
        <BrandText /> is built to settle fast and pay out on time. Live odds refresh every
        few seconds, and bets settle within minutes of full time.
      </p>
      {(d || perf.isLoading) && (
        <p className="not-prose text-sm text-[var(--color-ink-muted)]">
          Live payouts:{" "}
          <span className="font-semibold text-[var(--color-ink)]">
            {perf.isLoading
              ? "…"
              : `${Number(d?.winner_payout_points ?? 0).toLocaleString()} winner pts`}
          </span>
          {" · "}
          <span className="font-semibold text-[var(--color-ink)]">
            {perf.isLoading ? "…" : `${Number(d?.bets_placed ?? 0).toLocaleString()} bets`}
          </span>
          {success ? (
            <>
              {" · "}
              <span className="font-semibold text-[var(--color-ink)]">{success} success</span>
            </>
          ) : null}
        </p>
      )}
      <h3>What we track</h3>
      <ul>
        <li><span className="text-[var(--color-ink)]">Settlement time</span> — how long between full time and bets being marked won or lost.</li>
        <li><span className="text-[var(--color-ink)]">Payout time</span> — how long between a payout request and funds being sent.</li>
        <li><span className="text-[var(--color-ink)]">Support response</span> — median first-response time on new tickets.</li>
        <li><span className="text-[var(--color-ink)]">Uptime</span> — the platform's operational status across auth, odds, wallets, and payouts.</li>
      </ul>
      <div className="not-prose -mx-4 mt-8">
        <PayoutPerformanceSection />
        <CommunityGrowthSection />
      </div>
    </PublicShell>
  );
}
