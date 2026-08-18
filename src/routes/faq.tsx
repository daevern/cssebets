import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage, Section, Panel, Steps } from "@/components/public/PublicPage";
import { BrandText } from "@/components/brand/CsseMark";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { RecentPlatformActivity } from "@/components/landing/TrustSections";

const FAQ: { q: string; a: string }[] = [
  {
    q: "What is CSSEBets?",
    a: "A closed community points club. You stake community points on football, Formula 1 and UFC markets, or play CSSE Originals arcade games — all from one wallet. It is not a public casino and there is no anonymous deposit flow.",
  },
  {
    q: "How do I get points?",
    a: "Open Wallet → Request Points, transfer using the displayed details and your unique reference ID, upload proof, and submit. An admin reviews it and credits your wallet, usually within a few hours.",
  },
  {
    q: "How do I place a bet?",
    a: "Open a fixture, pick a market (Match Result, Over/Under 2.5, Race Winner, Method of Victory…), select an outcome, set your stake and lock it. Your potential return is shown before you confirm.",
  },
  {
    q: "Why is a market paused?",
    a: "Markets suspend when the odds feed goes stale, at kickoff, or during a live incident such as a goal or red card. They reopen automatically once fresh prices arrive.",
  },
  {
    q: "Can I cancel or edit a bet?",
    a: "You can adjust the stake of a pending bet before kickoff. Placed bets cannot be fully cancelled — only the stake can be changed while the market is still open.",
  },
  {
    q: "When do bets settle?",
    a: "As soon as the result is final. Football, F1 and UFC settle automatically from the provider feed within minutes of full time; anything ambiguous is graded by staff.",
  },
  {
    q: "How do free bets work?",
    a: "Free bets are stake-only tokens: on a winning bet you keep the profit, not the stake. Your available count is shown on each fixture.",
  },
  {
    q: "Are the arcade games fair?",
    a: "Every CSSE Original is server-authoritative and provably fair — the server commits the result before the animation plays, and the seed can be verified after the round.",
  },
  {
    q: "How long do payouts take?",
    a: "Most payouts are processed within 24 hours. An admin verifies, sends the transfer and uploads proof; you confirm receipt in the app. Larger amounts may require verification documents.",
  },
  {
    q: "What is demo mode?",
    a: "Guests browsing before login get a demo wallet with 1,000 practice points. Bets show in your picks until you refresh, and the balance resets to 1,000 on reload. Demo balances can never be withdrawn.",
  },
  {
    q: "I forgot my password — what now?",
    a: "Use the password reset link on the login page, or contact support with your reference ID if you no longer have access to your email.",
  },
  {
    q: "How do I get help fast?",
    a: "Open a support ticket in-app and include the bet or payout reference, the time it happened, and a screenshot. That's usually enough to resolve it on the first reply.",
  },
];

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "Help & FAQ — CSSEBets" },
      {
        name: "description",
        content:
          "How CSSEBets works: wallet points, placing bets, market suspensions, arcade fairness, free bets, payouts and demo mode.",
      },
      { property: "og:title", content: "CSSEBets help & FAQ" },
      {
        property: "og:description",
        content:
          "Wallet points, placing bets, market suspensions, arcade fairness, free bets, payouts and demo mode — explained.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://cssebets.com/faq" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: HelpPage,
});

function HelpPage() {
  return (
    <PublicPage
      eyebrow="Help"
      title={
        <>
          Everything you need to play,{" "}
          <span className="text-[var(--color-neon)]">in plain language</span>.
        </>
      }
      lede="Funding, betting, settlement, arcade fairness and payouts — the short answers first, the full FAQ below."
    >
      <Section index="01" title="From zero to your first bet">
        <Steps
          items={[
            {
              title: "Create an account",
              body: "Register with your details and referral code. Staff approve new members before real points are enabled.",
            },
            {
              title: "Fund your wallet",
              body: "Submit a point request with proof of transfer and your unique reference ID. Guests can instead reset practice points in demo mode.",
            },
            {
              title: "Lock a prediction",
              body: "Pick a fixture, choose a market and outcome, set a stake and confirm. Your potential return is shown up front.",
            },
            {
              title: "Get paid",
              body: "Winnings credit automatically at settlement. Request a payout from the Payout page and confirm receipt in-app.",
            },
          ]}
        />
      </Section>

      <Section index="02" title="Quick answers">
        <div className="grid gap-4 md:grid-cols-3">
          <Panel kicker="Sports">
            Football, F1 and UFC markets priced from a live feed, with movement charts on every
            market and automatic settlement after the event.
          </Panel>
          <Panel kicker="Arcade">
            Twelve CSSE Originals, all server-authoritative and provably fair, funded from the same
            wallet as your sports positions.
          </Panel>
          <Panel kicker="Wallet">
            One points balance, one transaction history. Every stake, settlement, bonus and payout
            is listed and auditable.
          </Panel>
        </div>
      </Section>

      <Section index="03" title="Full FAQ">
        <div className="border border-[var(--surface-border)] bg-[var(--surface-2)] px-5">
          <Accordion type="single" collapsible className="w-full">
            {FAQ.map((f, i) => (
              <AccordionItem key={f.q} value={`faq-${i}`} className="border-[var(--surface-border)]">
                <AccordionTrigger className="text-left text-[14px] font-semibold hover:text-[var(--color-neon)] hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-[14px] leading-relaxed text-[var(--ink-muted)]">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Section>

      <Section index="04" title="Still stuck?">
        <Panel accent kicker="Talk to a human">
          <p>
            Once you're registered, open a support ticket from the in-app Support tab — a real
            person replies, usually within a few hours.{" "}
            <Link to="/register" className="text-[var(--color-neon)] hover:underline">
              Create an account
            </Link>{" "}
            to get started, or{" "}
            <Link to="/auth" className="text-[var(--color-neon)] hover:underline">
              log in
            </Link>
            .
          </p>
          <p>
            <BrandText /> is for community play with points. Only stake what you can afford to
            lose.
          </p>
        </Panel>
      </Section>

      <Section index="05" title="Live platform activity">
        <div className="-mx-1">
          <RecentPlatformActivity />
        </div>
      </Section>
    </PublicPage>
  );
}
