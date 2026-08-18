import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PublicPage, Section, Panel, StatStrip } from "@/components/public/PublicPage";
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
      {
        name: "description",
        content:
          "Settlement speed, payout timelines, platform health and live activity — how CSSEBets actually performs.",
      },
      { property: "og:title", content: "CSSEBets performance" },
      {
        property: "og:description",
        content:
          "Settlement speed, payout timelines, platform health and live activity — how CSSEBets actually performs.",
      },
      { property: "og:type", content: "website" },
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
    d?.payout_success_rate != null ? `${Math.round(Number(d.payout_success_rate) * 100)}%` : "—";

  return (
    <PublicPage
      eyebrow="Performance"
      title={
        <>
          Fast settlement, honest numbers,{" "}
          <span className="text-[var(--color-neon)]">no waiting games</span>.
        </>
      }
      lede={
        <>
          <BrandText /> publishes the operational numbers that actually matter to a player: how
          quickly odds refresh, how fast bets settle, and how long a payout really takes. The
          figures below are read live from the platform.
        </>
      }
    >
      <StatStrip
        items={[
          {
            label: "Winner payouts",
            value: perf.isLoading ? "…" : Number(d?.winner_payout_points ?? 0).toLocaleString(),
            hint: "Points paid to winners",
          },
          {
            label: "Bets placed",
            value: perf.isLoading ? "…" : Number(d?.bets_placed ?? 0).toLocaleString(),
            hint: "All sports markets",
          },
          {
            label: "Payout success",
            value: perf.isLoading ? "…" : success,
            hint: "Requests completed",
          },
          { label: "Odds refresh", value: "~15s", hint: "Live market heartbeat" },
        ]}
      />

      <Section index="01" title="What we track" subtitle="Measured, not marketed">
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Settlement time">
            <p>
              Time between full time and a bet being graded won, lost or void. Football, F1 and UFC
              settle automatically from the provider feed; edge cases are graded by staff.
            </p>
          </Panel>
          <Panel title="Payout time">
            <p>
              Time between a payout request and funds being sent with proof uploaded. Most requests
              clear within 24 hours; larger amounts may need verification.
            </p>
          </Panel>
          <Panel title="Support response">
            <p>
              Median first-response time on new tickets. Every ticket is answered by a real staff
              member, and status changes push a notification.
            </p>
          </Panel>
          <Panel title="Platform health">
            <p>
              Auth, odds ingestion, wallets and payouts are health-checked continuously. Members
              can see live component status inside the app.
            </p>
          </Panel>
        </div>
      </Section>

      <Section index="02" title="How pricing stays honest">
        <div className="grid gap-4 md:grid-cols-3">
          <Panel kicker="Live feed">
            Sports odds come from a licensed provider and refresh on a short cycle, with movement
            history stored per market so you can see how a price got there.
          </Panel>
          <Panel kicker="Server-authoritative">
            Every arcade result is decided on the server with a committed seed before the animation
            runs — the client can never influence the outcome.
          </Panel>
          <Panel kicker="Double-entry ledger">
            Stakes, settlements, bonuses and payouts post to a journal with enforced liability
            reservations, so the club's books always balance.
          </Panel>
        </div>
      </Section>

      <Section index="03" title="Live performance">
        <div className="-mx-1">
          <PayoutPerformanceSection />
          <CommunityGrowthSection />
        </div>
      </Section>

      <Section index="04" title="Something looks off?">
        <Panel accent kicker="Report it">
          <p>
            If a market, settlement or payout doesn't look right, open a ticket from the in-app
            Support tab with the bet reference. See{" "}
            <Link to="/faq" className="text-[var(--color-neon)] hover:underline">
              the Help page
            </Link>{" "}
            for what to include.
          </p>
        </Panel>
      </Section>
    </PublicPage>
  );
}
