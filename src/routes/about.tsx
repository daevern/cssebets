import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage, Section, Panel, StatStrip, Steps } from "@/components/public/PublicPage";
import { BrandText } from "@/components/brand/CsseMark";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — CSSEBets" },
      {
        name: "description",
        content:
          "CSSEBets is a closed community points club: sports prediction markets on football, F1 and UFC plus house originals, settled from one auditable points wallet.",
      },
      { property: "og:title", content: "About CSSEBets" },
      {
        property: "og:description",
        content:
          "A closed community points club — sports markets, house originals and one auditable points wallet.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://cssebets.com/about" }],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <PublicPage
      eyebrow="About"
      title={
        <>
          A points club that prices markets{" "}
          <span className="text-[var(--color-neon)]">like a book</span> and settles them like an
          exchange.
        </>
      }
      lede={
        <>
          <BrandText /> is a closed community club built around the FIFA World Cup 2026 and ongoing
          football, Formula 1 and UFC. Members stake community points — never a public casino
          deposit product — across live sports markets and house originals from a single wallet.
        </>
      }
    >
      <StatStrip
        items={[
          { label: "Sports", value: "4", hint: "World Cup, club football, F1, UFC" },
          { label: "Originals", value: "12", hint: "Server-authoritative house games" },
          { label: "Wallet", value: "1", hint: "One ledger for every stake & payout" },
          { label: "Currency", value: "Points", hint: "Community points, not cash chips" },
        ]}
      />

      <Section index="01" title="What CSSEBets is" subtitle="And what it is not">
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="A community points club" accent>
            <p>
              Access is approved by staff. Points are issued and redeemed under your community's
              own funding rules, tracked in a double-entry ledger where every credit has a matching
              debit.
            </p>
          </Panel>
          <Panel title="Not a public casino">
            <p>
              There is no anonymous deposit flow and no open sign-up to real balances. Guests get a
              demo wallet; members play under club rules with staff-reviewed funding and payouts.
            </p>
          </Panel>
        </div>
      </Section>

      <Section index="02" title="Who it's for">
        <div className="grid gap-4 md:grid-cols-3">
          <Panel kicker="Members">
            Private sports communities that want shared tipping, leagues and an arcade in one app.
          </Panel>
          <Panel kicker="Traders">
            Players who care about live pricing, market movement charts and clean settlement.
          </Panel>
          <Panel kicker="Guests">
            Anyone who wants to try the whole product on 1,000 practice points before joining.
          </Panel>
        </div>
      </Section>

      <Section index="03" title="What you can do">
        <div className="grid gap-4 md:grid-cols-3">
          <Panel title="Sports markets">
            <p>
              Football, F1 and UFC fixtures priced from a live odds feed: match result, totals,
              BTTS, race winner, podium, method of victory and more — with movement history on
              every market.
            </p>
          </Panel>
          <Panel title="CSSE Originals">
            <p>
              Plinko, Roulette, Blackjack, Keno, Crash, Dragon Towers, Video Poker and more. Every
              result is decided server-side and provably fair — the house commits before the
              animation plays.
            </p>
          </Panel>
          <Panel title="One wallet">
            <p>
              Stakes, settlements, bonuses and payouts all land in the same points wallet with a
              full transaction history you can audit line by line.
            </p>
          </Panel>
        </div>
      </Section>

      <Section index="04" title="How to get started">
        <Steps
          items={[
            {
              title: "Open the demo",
              body: "Browse as a guest with 1,000 practice points. Every market and original is playable, and your balance resets on refresh.",
            },
            {
              title: "Register & get approved",
              body: "Create an account with your details and referral code. Staff review new members before real points are enabled.",
            },
            {
              title: "Fund your wallet",
              body: "Submit a point request with your unique reference and proof of transfer. An admin reviews and credits your balance.",
            },
            {
              title: "Play and cash out",
              body: "Lock predictions or play originals. Winnings credit automatically; request a payout whenever you're ready.",
            },
          ]}
        />
      </Section>

      <Section index="05" title="Responsible play">
        <Panel accent kicker="House rules">
          <p>
            <BrandText /> is for community play with points. Set your own limits, take breaks, and
            never stake more than you can afford to lose. Members can ask staff to pause an account
            at any time from{" "}
            <Link to="/faq" className="text-[var(--color-neon)] hover:underline">
              the Help page
            </Link>
            .
          </p>
        </Panel>
      </Section>
    </PublicPage>
  );
}
