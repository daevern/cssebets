import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PublicPage, Section, Panel, StatStrip, Steps } from "@/components/public/PublicPage";
import { BrandText } from "@/components/brand/CsseMark";
import {
  CommunityGrowthSection,
  RecentPlatformActivity,
} from "@/components/landing/TrustSections";
import { getPublicPlatformPulse } from "@/lib/trust-public.functions";

export const Route = createFileRoute("/community")({
  head: () => ({
    meta: [
      { title: "Community — CSSEBets" },
      {
        name: "description",
        content:
          "Inside the CSSEBets club: private leagues, referral rewards, live member activity and human support.",
      },
      { property: "og:title", content: "The CSSEBets community" },
      {
        property: "og:description",
        content:
          "Private leagues, referral rewards, live club activity and human support inside CSSEBets.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://cssebets.com/community" }],
  }),
  component: CommunityPage,
});

function CommunityPage() {
  const pulseFn = useServerFn(getPublicPlatformPulse);
  const pulse = useQuery({
    queryKey: ["public", "platform-pulse"],
    queryFn: () => pulseFn({}),
    staleTime: 60_000,
  });
  const n = (v: unknown) => (v == null ? "—" : Number(v).toLocaleString());

  return (
    <PublicPage
      eyebrow="Community"
      title={
        <>
          Play against people you actually{" "}
          <span className="text-[var(--color-neon)]">know</span>.
        </>
      }
      lede={
        <>
          <BrandText /> is a closed club, not a crowd. Leagues, referrals and standings are built
          around the members already in your circle — guests can try the demo wallet, and real
          points unlock once staff approve your account.
        </>
      }
    >
      <StatStrip
        items={[
          {
            label: "Members",
            value: pulse.isLoading ? "…" : n(pulse.data?.registered_members),
            hint: "Registered club accounts",
          },
          {
            label: "Bets placed",
            value: pulse.isLoading ? "…" : n(pulse.data?.bets_placed),
            hint: "Across all sports",
          },
          { label: "Leagues", value: "Private", hint: "Invite code only" },
          { label: "Support", value: "Human", hint: "Real staff, not bots" },
        ]}
      />

      <Section index="01" title="Leagues" subtitle="Invite-code standings">
        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
          <Panel title="Run your own table" accent>
            <p>
              Create a private league, share the invite code, and rank members across World Cup
              predictions plus club football, F1 and UFC net P/L. Filter standings by sport to see
              who is genuinely good at what.
            </p>
            <p>
              Leagues settle from the same ledger as everything else, so positions update the
              moment a fixture is graded.
            </p>
            <p className="pt-1">
              <Link
                to="/leagues"
                search={{ join: undefined }}
                className="inline-flex rounded-full border border-[var(--color-neon)]/50 bg-[var(--color-neon)]/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-neon)]"
              >
                Open leagues
              </Link>
            </p>
          </Panel>
          <Panel kicker="How scoring works">
            <ul className="list-disc space-y-1.5 pl-4">
              <li>Net profit/loss in points over the league window.</li>
              <li>World Cup prediction accuracy counts toward your total.</li>
              <li>Arcade play is excluded — leagues are sports only.</li>
              <li>Ties break on the earlier settled position.</li>
            </ul>
          </Panel>
        </div>
      </Section>

      <Section index="02" title="Referrals" subtitle="Both sides earn">
        <Steps
          items={[
            {
              title: "Share your code",
              body: "Every member gets a referral code and link from the app menu.",
            },
            {
              title: "They register",
              body: "Your code is captured during sign-up and shown to staff on approval.",
            },
            {
              title: "They start playing",
              body: "Rewards trigger once your referral is approved and active, not on sign-up alone.",
            },
            {
              title: "Both get points",
              body: "Bonus points land in both wallets and appear in your transaction history.",
            },
          ]}
        />
        <p className="pt-1">
          <Link
            to="/referrals"
            className="inline-flex rounded-full border border-[var(--surface-border)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            Your referral code
          </Link>
        </p>
      </Section>

      <Section index="03" title="Support" subtitle="Answered by people">
        <div className="grid gap-4 md:grid-cols-3">
          <Panel kicker="Tickets">
            Open a ticket in-app for billing, payouts, bets or account access. Attach screenshots
            and we'll usually reply within a few hours.
          </Panel>
          <Panel kicker="Notifications">
            Every status change — point request, settlement, payout — pushes a notification so you
            never have to chase staff.
          </Panel>
          <Panel kicker="Fair play">
            Collusion, multi-accounting and abuse of demo mode end in removal from the club. Keep
            it clean and it stays fun.
          </Panel>
        </div>
      </Section>

      <Section index="04" title="Live club activity">
        <div className="-mx-1">
          <CommunityGrowthSection />
          <RecentPlatformActivity />
        </div>
      </Section>
    </PublicPage>
  );
}
