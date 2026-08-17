import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PublicShell } from "@/routes/about";
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
        content: "The CSSEBets community — members, leagues, referrals and live club activity.",
      },
      { property: "og:title", content: "The CSSEBets community" },
      {
        property: "og:description",
        content: "The CSSEBets community — members, leagues, referrals and live club activity.",
      },
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
  const members = pulse.data?.registered_members;
  const bets = pulse.data?.bets_placed;

  return (
    <PublicShell title="Community" kicker="Play with friends">
      <p>
        <BrandText /> is a closed community points club. Guests can try the demo wallet;
        real points unlock after staff approve your account.
      </p>
      {(members != null || bets != null) && (
        <p className="not-prose text-sm text-[var(--color-ink-muted)]">
          Live pulse:{" "}
          <span className="font-semibold text-[var(--color-ink)]">
            {members != null ? `${Number(members).toLocaleString()} members` : "—"}
          </span>
          {" · "}
          <span className="font-semibold text-[var(--color-ink)]">
            {bets != null ? `${Number(bets).toLocaleString()} bets placed` : "—"}
          </span>
        </p>
      )}
      <h3>Leagues</h3>
      <p>
        Create a private league and share an invite code, or join a friend&apos;s club.
        Standings rank members across World Cup predictions plus football, F1, and UFC
        net P/L — filter by sport on the league page.
      </p>
      <p className="not-prose">
        <Link
          to="/leagues"
          search={{ join: undefined }}
          className="inline-flex rounded-full border border-[var(--color-neon)]/50 bg-[var(--color-neon)]/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-neon)]"
        >
          Open leagues
        </Link>
      </p>
      <h3>Referrals</h3>
      <p>
        When someone joins with your link and starts playing, both of you earn bonus
        points. The more active your referrals, the bigger your rewards.
      </p>
      <p className="not-prose">
        <Link
          to="/referrals"
          className="inline-flex rounded-full border border-[var(--color-line)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]"
        >
          Your referral code
        </Link>
      </p>
      <h3>Support</h3>
      <p>
        Every ticket is answered by a real person, usually within a few hours. Reach the
        team any time from the Help page inside the app.
      </p>
      <div className="not-prose -mx-4 mt-8">
        <CommunityGrowthSection />
        <RecentPlatformActivity />
      </div>
    </PublicShell>
  );
}
