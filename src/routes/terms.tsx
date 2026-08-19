import { createFileRoute } from "@tanstack/react-router";
import { PublicPage, Section, Panel } from "@/components/public/PublicPage";

const UPDATED = "19 August 2026";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — CSSEBets" },
      {
        name: "description",
        content:
          "The rules for using CSSEBets: eligibility, community points, market settlement, house originals, account conduct and account closure.",
      },
      { property: "og:title", content: "Terms of Service — CSSEBets" },
      {
        property: "og:description",
        content:
          "Eligibility, community points, settlement rules and account conduct for the CSSEBets community points club.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://cssebets.com/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <PublicPage
      eyebrow={`Updated ${UPDATED}`}
      title={
        <>
          Terms of <span className="text-[var(--color-neon)]">Service</span>
        </>
      }
      lede="These terms govern your access to CSSEBets. By creating an account or using a demo session you agree to them. If you do not agree, do not use the platform."
    >
      <Section index="01" title="Eligibility and account">
        <Panel>
          <p>
            You must be at least 18 years old and legally permitted to use a points-based
            prediction and games platform where you live. Membership is by approval — we may
            decline, suspend or close an account at our discretion.
          </p>
          <p>
            One account per person. You are responsible for keeping your login credentials secure
            and for all activity that happens under your account.
          </p>
        </Panel>
      </Section>

      <Section index="02" title="Community points">
        <Panel>
          <p>
            CSSEBets runs on community points. Points are a closed in-platform balance used to
            enter markets and play house originals. They carry no cash value outside the club and
            are not a deposit, investment or financial instrument.
          </p>
          <p>
            Demo sessions start with a fixed practice balance that resets and never converts to
            member points.
          </p>
        </Panel>
      </Section>

      <Section index="03" title="Markets and settlement">
        <Panel>
          <p>
            Odds and prices are set by the house and can move at any time. The price shown when a
            position is confirmed is the price that applies to it.
          </p>
          <p>
            Markets settle against the official result reported by the relevant competition or data
            provider. Where a fixture is abandoned, postponed beyond our settlement window or a
            result is later corrected, we may void affected positions and return stakes.
          </p>
          <p>
            Obvious pricing errors, data-feed faults and positions placed after an event outcome is
            known may be voided. Settlement decisions by the house are final, and every adjustment
            is written to the audit ledger.
          </p>
        </Panel>
      </Section>

      <Section index="04" title="House originals">
        <Panel>
          <p>
            All house original games resolve server-side using provably fair seeds. Client display
            is presentation only; the server result is authoritative. Configured house margins are
            published in the game rules for each title.
          </p>
        </Panel>
      </Section>

      <Section index="05" title="Fair use and prohibited conduct">
        <Panel>
          <p>
            You may not use bots, scripts, automated clients, multiple accounts, collusion, exploit
            of a bug or any interference with our systems. We may reverse points, void positions
            and close accounts where we detect abuse.
          </p>
        </Panel>
      </Section>

      <Section index="06" title="Availability and changes">
        <Panel>
          <p>
            The platform is provided as-is. Features, markets and games may change, pause or be
            withdrawn. We may update these terms; material changes will be announced in the club
            and the updated date above will change.
          </p>
        </Panel>
      </Section>

      <Section index="07" title="Contact">
        <Panel>
          <p>
            Questions about these terms can be raised through the in-app support channel or the
            Help page.
          </p>
        </Panel>
      </Section>
    </PublicPage>
  );
}
