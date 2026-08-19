import { createFileRoute } from "@tanstack/react-router";
import { PublicPage, Section, Panel, Steps } from "@/components/public/PublicPage";

export const Route = createFileRoute("/responsible-gambling")({
  head: () => ({
    meta: [
      { title: "Responsible Gambling — CSSEBets" },
      {
        name: "description",
        content:
          "Play in control: how CSSEBets handles limits, breaks and self-exclusion, warning signs to watch for, and where to get independent help.",
      },
      { property: "og:title", content: "Responsible Gambling — CSSEBets" },
      {
        property: "og:description",
        content:
          "Limits, breaks, self-exclusion and independent support — how to keep play in control on CSSEBets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://cssebets.com/responsible-gambling" }],
  }),
  component: ResponsibleGamblingPage,
});

function ResponsibleGamblingPage() {
  return (
    <PublicPage
      eyebrow="Play in control"
      title={
        <>
          Responsible <span className="text-[var(--color-neon)]">gambling</span>
        </>
      }
      lede="CSSEBets is entertainment, not income. Points can and do go to zero. If play stops being fun, stop — and use the tools below."
    >
      <Section index="01" title="House principles">
        <Panel accent kicker="The short version">
          <p>Members must be 18 or over. There are no exceptions.</p>
          <p>Never stake more than you are comfortable losing, and never chase a losing run.</p>
          <p>
            Points have no cash value outside the club and should never be treated as an
            investment.
          </p>
        </Panel>
      </Section>

      <Section index="02" title="Keeping play healthy">
        <Steps
          items={[
            {
              title: "Set a session budget",
              body: "Decide how many points you are willing to risk before you start, and stop when you reach it — win or lose.",
            },
            {
              title: "Keep sessions short",
              body: "Take regular breaks. Long unbroken sessions are the strongest predictor of chasing behaviour.",
            },
            {
              title: "Never chase losses",
              body: "Increasing stakes to recover a loss changes the size of the loss, not the odds.",
            },
            {
              title: "Play sober and rested",
              body: "Avoid staking when tired, stressed, or under the influence of alcohol.",
            },
          ]}
        />
      </Section>

      <Section index="03" title="Warning signs">
        <Panel>
          <p>
            Staking more than you planned, hiding play from people close to you, borrowing to keep
            playing, feeling anxious or irritable when you cannot play, or chasing losses across
            sessions are all signals to pause.
          </p>
          <p>
            If more than one of those sounds familiar, take a break now and speak to someone you
            trust.
          </p>
        </Panel>
      </Section>

      <Section index="04" title="Taking a break or leaving">
        <Panel>
          <p>
            Contact the club through the in-app support channel and ask for a cooling-off period or
            permanent self-exclusion. Cooling-off suspends your ability to stake for an agreed
            period; self-exclusion closes club access for good.
          </p>
          <p>
            We will not re-open a self-excluded account on request during the exclusion period, and
            we will not send promotional messages to excluded members.
          </p>
        </Panel>
      </Section>

      <Section index="05" title="Independent help">
        <Panel>
          <p>
            Free, confidential support is available independently of the club. Talk to a qualified
            service in your country rather than relying on the operator alone:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <a
                href="https://www.begambleaware.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-neon)] hover:underline"
              >
                BeGambleAware
              </a>{" "}
              — free advice and treatment referral (UK).
            </li>
            <li>
              <a
                href="https://www.gamblersanonymous.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-neon)] hover:underline"
              >
                Gamblers Anonymous
              </a>{" "}
              — international peer support meetings.
            </li>
            <li>
              <a
                href="https://www.gamblingtherapy.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-neon)] hover:underline"
              >
                Gambling Therapy
              </a>{" "}
              — free online support in multiple languages, worldwide.
            </li>
          </ul>
          <p>In an emergency, contact your local emergency services.</p>
        </Panel>
      </Section>
    </PublicPage>
  );
}
