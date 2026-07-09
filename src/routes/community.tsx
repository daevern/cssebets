import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/routes/about";
import { BrandText } from "@/components/brand/CsseMark";
import {
  CommunityGrowthSection,
  RecentPlatformActivity,
} from "@/components/landing/TrustSections";

export const Route = createFileRoute("/community")({
  head: () => ({
    meta: [
      { title: "Community — CSSEBets" },
      { name: "description", content: "Meet the CSSEBets community — players, leagues, referrals and live platform activity." },
      { property: "og:title", content: "The CSSEBets community" },
      { property: "og:description", content: "Meet the CSSEBets community — players, leagues, referrals and live platform activity." },
    ],
  }),
  component: CommunityPage,
});

function CommunityPage() {
  return (
    <>
      <PublicShell title="Community" kicker="Play with friends">
        <p>
          <BrandText /> is built around friends playing together. Every player gets a
          referral link — invite friends, share picks, and climb the leaderboards.
        </p>
        <h3>Leagues</h3>
        <p>
          Create a private league with your friends or join a public one. Leagues track
          weekly points, streaks, and best picks so bragging rights are always on the line.
        </p>
        <h3>Referrals</h3>
        <p>
          When someone joins with your link and starts playing, both of you earn bonus
          points. The more active your referrals, the bigger your rewards.
        </p>
        <h3>Support</h3>
        <p>
          Every ticket is answered by a real person, usually within a few hours. Reach the
          team any time from the Help page inside the app.
        </p>
      </PublicShell>
      <CommunityGrowthSection />
      <RecentPlatformActivity />
    </>
  );
}
