import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "@/routes/about";
import { BrandText } from "@/components/brand/CsseMark";
import { RecentPlatformActivity } from "@/components/landing/TrustSections";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "Help — CSSEBets" },
      {
        name: "description",
        content:
          "How CSSEBets works for community members — wallet points, sports markets, arcade originals, and payouts.",
      },
      { property: "og:title", content: "CSSEBets help & FAQ" },
      {
        property: "og:description",
        content:
          "How CSSEBets works for community members — wallet points, sports markets, arcade originals, and payouts.",
      },
          { property: "og:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://cssebets.com/faq" }],
  }),
  component: HelpPage,
});

function HelpPage() {
  return (
    <PublicShell title="Help" kicker="FAQ & how-to">
      <h3>What is CSSEBets?</h3>
      <p>
        A closed community points club: stake community points on football, F1 and UFC markets,
        or play CSSE Originals arcade games from one wallet. Guests can try practice points;
        members play under community funding rules. It is not a public casino.
      </p>
      <h3>Funding my wallet</h3>
      <p>
        Submit a point request from the Wallet page with proof of transfer. An admin
        reviews it and credits your wallet — usually within a few hours. Guests can reset
        practice points from the demo wallet controls.
      </p>
      <h3>Placing a bet</h3>
      <p>
        Open a fixture, tap a market (e.g. Match Result, Over/Under 2.5), select an
        outcome, choose your stake, and lock the prediction. Your potential payout is
        shown before you confirm.
      </p>
      <h3>Arcade (CSSE Originals)</h3>
      <p>
        Open Arcade from the app nav. Every original is server-authoritative and provably
        fair — the house commits the result before the animation plays.
      </p>
      <h3>Free bets</h3>
      <p>
        Free bets are stake-only tokens — the stake is not returned on a winning bet,
        only the profit. Your available count is shown on each fixture.
      </p>
      <h3>Getting paid</h3>
      <p>
        Request a payout from the Payout page. An admin verifies, sends the transfer,
        and uploads proof. You confirm receipt directly in the app.
      </p>
      <h3>Still stuck?</h3>
      <p>
        Once you're registered, open a support ticket from the in-app Support tab and a
        real person will reply. <Link to="/register" className="text-[var(--color-neon)] hover:underline">Create an account</Link> to get started, or <Link to="/auth" className="text-[var(--color-neon)] hover:underline">log in</Link>.
      </p>
      <p className="text-[var(--color-ink-muted)]">
        <BrandText /> is for community play with points. Only stake what you can afford
        to lose.
      </p>
      <div className="not-prose -mx-4 mt-8">
        <RecentPlatformActivity />
      </div>
    </PublicShell>
  );
}


