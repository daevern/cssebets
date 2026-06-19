import { createFileRoute } from "@tanstack/react-router";
import { PageShell, StencilPanel } from "@/components/ui/page-shell";
import { IconShield, IconTimeline } from "@/components/trust/TrustIcons";

export const Route = createFileRoute("/_authenticated/trust-center")({
  head: () => ({
    meta: [
      { title: "Trust Center — cssebets" },
      { name: "description", content: "How CSSEBets handles points, bets, payouts, and security. Maintained by the CSSEBets team." },
    ],
  }),
  component: TrustCenter,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <StencilPanel kicker={<><IconShield className="h-3 w-3" /> {title}</>}>
      <div className="space-y-3 text-sm leading-relaxed text-[var(--color-ink)]">
        {children}
      </div>
    </StencilPanel>
  );
}

function TrustCenter() {
  return (
    <PageShell
      kicker="Trust Center"
      title="How we operate,"
      titleAccent="in plain English."
      wide
    >
      <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
        This page is maintained by the CSSEBets team to answer common questions about
        how we handle points, bets, payouts, and security. It is not an independent
        certification — it is our own description of how the platform works today.
      </p>

      <Section title="Our commitment">
        <p>We focus on a few things every day:</p>
        <ul className="list-disc space-y-1.5 pl-5 text-[var(--color-ink-muted)]">
          <li><span className="text-[var(--color-ink)]">Transparent odds</span> — every selection shows the reference odds used at the moment your bet is placed.</li>
          <li><span className="text-[var(--color-ink)]">Manual review</span> — every point request and every payout request is reviewed by a real person.</li>
          <li><span className="text-[var(--color-ink)]">Secure account handling</span> — sessions, passwords, and account changes go through our authentication provider.</li>
          <li><span className="text-[var(--color-ink)]">Fair settlement</span> — bets are settled against the official result of the match.</li>
        </ul>
      </Section>

      <Section title="How points work">
        <p>
          Points are the internal unit used to place bets on CSSEBets. They are not
          a cryptocurrency or a publicly traded asset.
        </p>
        <ol className="list-decimal space-y-1.5 pl-5 text-[var(--color-ink-muted)]">
          <li>You submit a <span className="text-[var(--color-ink)]">point request</span> with proof of your transfer.</li>
          <li>An admin reviews the request and either approves it or requests more info.</li>
          <li>Approved points are credited to your wallet and visible in your balance immediately.</li>
          <li>You stake points on bets; winning bets credit your wallet automatically.</li>
        </ol>
      </Section>

      <Section title="Settlement policy">
        <ul className="list-disc space-y-1.5 pl-5 text-[var(--color-ink-muted)]">
          <li>Matches are settled once the final result is available from the data feed.</li>
          <li>If a match is voided or cancelled, affected bets are refunded at original stake.</li>
          <li>If an event is suspended or postponed beyond a reasonable window, bets are voided and refunded.</li>
          <li>Settlement is automated; flagged bets are reviewed manually before payout.</li>
        </ul>
      </Section>

      <Section title="Payout policy">
        <ul className="list-disc space-y-1.5 pl-5 text-[var(--color-ink-muted)]">
          <li>Withdraw using the Payout page. We collect the bank details needed to process the transfer.</li>
          <li>An admin verifies the request, processes the transfer, and uploads proof.</li>
          <li>You confirm receipt — or flag a problem — directly in the app.</li>
          <li>Typical processing time is shown on the Payout page based on real recent history.</li>
        </ul>
      </Section>

      <Section title="Responsible play">
        <p>
          Only bet what you can afford to lose. Set yourself limits. If betting stops
          feeling like a game, step away — your wallet, picks, and history will still
          be here when you return. Contact support any time you need help.
        </p>
      </Section>

      <StencilPanel kicker={<><IconTimeline className="h-3 w-3" /> Need anything else?</>}>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Open a support ticket from the Support tab. Most messages get a reply
          within the response window shown on the Support page.
        </p>
      </StencilPanel>
    </PageShell>
  );
}
