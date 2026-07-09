import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "@/routes/about";
import { BrandText } from "@/components/brand/CsseMark";
import { RecentPlatformActivity } from "@/components/landing/TrustSections";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "Help — CSSEBets" },
      { name: "description", content: "How to use CSSEBets — funding your wallet, placing bets, and getting paid." },
      { property: "og:title", content: "CSSEBets help & FAQ" },
      { property: "og:description", content: "How to use CSSEBets — funding your wallet, placing bets, and getting paid." },
    ],
  }),
  component: HelpPage,
});

function HelpPage() {
  return (
    <>
      <PublicShell title="Help" kicker="FAQ & how-to">
        <h3>Funding my wallet</h3>
        <p>
          Submit a point request from the Wallet page with proof of transfer. An admin
          reviews it and credits your wallet — usually within a few hours.
        </p>
        <h3>Placing a bet</h3>
        <p>
          Open a fixture, tap a market (e.g. Match Result, Over/Under 2.5), select an
          outcome, choose your stake, and lock the prediction. Your potential payout is
          shown before you confirm.
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
          <BrandText /> is a prediction-market platform. Only play with what you can afford
          to lose.
        </p>
      </PublicShell>
      <RecentPlatformActivity />
    </>
  );
}

