import { createFileRoute } from "@tanstack/react-router";
import { PublicPage, Section, Panel } from "@/components/public/PublicPage";

const UPDATED = "19 August 2026";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — CSSEBets" },
      {
        name: "description",
        content:
          "How CSSEBets handles member data: what we collect, why we hold it, how long we keep it and the controls you have over your account information.",
      },
      { property: "og:title", content: "Privacy Policy — CSSEBets" },
      {
        property: "og:description",
        content:
          "What CSSEBets collects, why we hold it, how long we keep it and the controls you have.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://cssebets.com/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PublicPage
      eyebrow={`Updated ${UPDATED}`}
      title={
        <>
          Privacy <span className="text-[var(--color-neon)]">Policy</span>
        </>
      }
      lede="We keep the data set small on purpose: enough to run your wallet, settle markets and keep the club secure — no more."
    >
      <Section index="01" title="What we collect">
        <Panel>
          <p>
            <strong className="text-[var(--ink)]">Account data</strong> — the name, email address
            and any contact detail you provide at registration, plus your referral relationship if
            you joined through a member link.
          </p>
          <p>
            <strong className="text-[var(--ink)]">Activity data</strong> — positions, stakes,
            settlements, wallet movements and game rounds. These form the audit ledger and cannot
            be edited after the fact.
          </p>
          <p>
            <strong className="text-[var(--ink)]">Technical data</strong> — sign-in events, device
            and browser information and error reports used to keep the service working and secure.
          </p>
        </Panel>
      </Section>

      <Section index="02" title="Why we hold it">
        <Panel>
          <p>
            To operate your account and points wallet, price and settle markets, prevent abuse and
            multi-accounting, provide support, and meet our record-keeping obligations as the
            operator of the club.
          </p>
          <p>We do not sell member data, and we do not run third-party advertising trackers.</p>
        </Panel>
      </Section>

      <Section index="03" title="Who can see it">
        <Panel>
          <p>
            Access inside the club is role-restricted: ordinary members can only read their own
            records, and every privileged action is logged. Other members see only what you choose
            to make public, such as a leaderboard display name.
          </p>
          <p>
            We rely on infrastructure providers for hosting, database, email delivery and error
            monitoring. They process data on our instructions only.
          </p>
        </Panel>
      </Section>

      <Section index="04" title="How long we keep it">
        <Panel>
          <p>
            Account records are kept while your account is open. Financial and settlement ledger
            entries are retained after closure because they are part of an immutable audit trail.
            Operational logs and market history snapshots are pruned on a rolling retention
            schedule.
          </p>
        </Panel>
      </Section>

      <Section index="05" title="Your controls">
        <Panel>
          <p>
            You can update your profile details in settings, adjust notification preferences at any
            time, and request a copy or deletion of your personal data through support. Ledger
            entries required for audit integrity are anonymised rather than removed.
          </p>
        </Panel>
      </Section>

      <Section index="06" title="Cookies and local storage">
        <Panel>
          <p>
            We use cookies and browser storage to keep you signed in, remember demo sessions and
            store interface preferences. No advertising or cross-site tracking cookies are set.
          </p>
        </Panel>
      </Section>

      <Section index="07" title="Contact">
        <Panel>
          <p>
            Privacy requests can be raised through the in-app support channel or the Help page and
            are handled by the club operator.
          </p>
        </Panel>
      </Section>
    </PublicPage>
  );
}
