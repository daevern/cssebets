import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/routes/about";
import { BrandText } from "@/components/brand/CsseMark";
import {
  PayoutPerformanceSection,
  CommunityGrowthSection,
} from "@/components/landing/TrustSections";

export const Route = createFileRoute("/performance")({
  head: () => ({
    meta: [
      { title: "Performance — CSSEBets" },
      { name: "description", content: "How CSSEBets performs — settlement speed, payout timelines, platform health and live activity." },
      { property: "og:title", content: "CSSEBets performance" },
      { property: "og:description", content: "How CSSEBets performs — settlement speed, payout timelines, platform health and live activity." },
    ],
  }),
  component: PerformancePage,
});

function PerformancePage() {
  return (
    <>
      <PublicShell title="Performance" kicker="Reliability & speed">
        <p>
          <BrandText /> is built to settle fast and pay out on time. Live odds refresh every
          few seconds, and bets settle within minutes of full time.
        </p>
        <h3>What we track</h3>
        <ul>
          <li><span className="text-[var(--color-ink)]">Settlement time</span> — how long between full time and bets being marked won or lost.</li>
          <li><span className="text-[var(--color-ink)]">Payout time</span> — how long between a payout request and funds being sent.</li>
          <li><span className="text-[var(--color-ink)]">Support response</span> — median first-response time on new tickets.</li>
          <li><span className="text-[var(--color-ink)]">Uptime</span> — the platform's operational status across auth, odds, wallets, and payouts.</li>
        </ul>
      </PublicShell>
      <PayoutPerformanceSection />
      <CommunityGrowthSection />
    </>
  );
}
