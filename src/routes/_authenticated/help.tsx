import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useTour } from "@/components/onboarding/TourProvider";
import { TOURS } from "@/components/onboarding/tours.config";
import { Sparkles, Wallet, Banknote, Headset, ListChecks, BookOpen, RefreshCw, ArrowUpRight, HelpCircle } from "lucide-react";
import { PageShell, StencilPanel } from "@/components/ui/page-shell";
import { BrandText } from "@/components/brand/CsseMark";

export const Route = createFileRoute("/_authenticated/help")({
  head: () => ({ meta: [{ title: "Help Center — cssebets" }] }),
  component: HelpCenter,
});

type Section = {
  id: string;
  title: string;
  icon: any;
  tourKey?: string;
  body: ReactNode;
  link?: { to: string; label: string };
};

const SECTIONS: Section[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: BookOpen,
    tourKey: "dashboard",
    body: <><BrandText /> is a points-based prediction platform. After approval, you'll have a wallet, can request points, place bets on matches, track predictions, and request payouts on your winnings.</>,
    link: { to: "/dashboard", label: "Open Dashboard" },
  },
  {
    id: "wallet",
    title: "Wallet & Points",
    icon: Wallet,
    tourKey: "wallet",
    body: "Your wallet holds your points balance. Every debit, credit, refund and payout shows in your transaction history. Top up by submitting a Point Request with proof of payment.",
    link: { to: "/wallet", label: "Open Wallet" },
  },
  {
    id: "betting",
    title: "Betting Guide",
    icon: ListChecks,
    tourKey: "betting",
    body: "Pick a match, choose a market, enter a stake, review your potential return, then confirm. Stakes are deducted immediately and held until the match settles.",
    link: { to: "/bets", label: "Browse Matches" },
  },
  {
    id: "payouts",
    title: "Payout Guide",
    icon: Banknote,
    tourKey: "payout",
    body: "Once you have winnings, request a payout. Track each request's status in your payout history. Verification documents may be required for larger payouts.",
    link: { to: "/payout", label: "Open Payouts" },
  },
  {
    id: "support",
    title: "Support Guide",
    icon: Headset,
    tourKey: "support",
    body: "Open a ticket if anything goes wrong — billing, payouts, bets, account access. Attach screenshots to help us help you faster.",
    link: { to: "/support", label: "Open Support" },
  },
];

const FAQ = [
  { q: "How do I get points?", a: "Open Wallet → Request Points, transfer funds using the displayed PointBank details and your unique reference ID, upload proof, and submit. An admin reviews and credits your account." },
  { q: "Why was my bet locked?", a: "Bets lock at kickoff. Any pending bet placed after the kickoff time is rejected automatically." },
  { q: "When do bets settle?", a: "As soon as the match result is finalized by an admin. Winning stakes are credited to your wallet immediately." },
  { q: "Can I cancel a bet?", a: "You can edit the stake of a pending bet before kickoff. You cannot fully cancel placed bets — only adjust stake." },
  { q: "How long do payouts take?", a: "Most payouts are processed within 24 hours. You'll get a notification at every status change." },
  { q: "I forgot my password — what now?", a: "Use the password reset link on the login page, or contact support with your reference ID." },
];

function HelpCenter() {
  const { startTour, startFullTour } = useTour();
  return (
    <PageShell kicker="Coaches Corner · Help" title="Play the" titleAccent="manual.">
      {/* Restart full tour */}
      <StencilPanel kicker={<><Sparkles className="h-3 w-3" /> Full walkthrough</>} accent>
        <div className="flex items-start justify-between gap-3 flex-col sm:flex-row sm:items-center">
          <p className="text-sm text-[var(--color-ink-muted)] max-w-md">
            Everything you need to use <BrandText /> confidently. Restart the full guided tour at any time.
          </p>
          <button
            type="button"
            onClick={startFullTour}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[var(--color-neon)] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-black shadow-[0_0_24px_var(--color-neon-glow)] hover:brightness-110"
          >
            <Sparkles className="h-4 w-4" /> Restart full tour
          </button>
        </div>
      </StencilPanel>

      {/* Sections */}
      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((s, i) => {
          const Icon = s.icon;
          return (
            <StencilPanel
              key={s.id}
              kicker={<><Icon className="h-3 w-3" /> {s.title}</>}
              meta={`${String(i + 1).padStart(2, "0")} / ${String(SECTIONS.length).padStart(2, "0")}`}
            >
              <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">{s.body}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {s.link && (
                  <Link
                    to={s.link.to as any}
                    className="inline-flex items-center gap-1.5 border border-[var(--color-neon)]/40 bg-[var(--color-neon)]/5 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-neon)] hover:bg-[var(--color-neon)]/10"
                  >
                    {s.link.label}
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                )}
                {s.tourKey && TOURS[s.tourKey] && (
                  <button
                    type="button"
                    onClick={() => startTour(s.tourKey!)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)] hover:text-[var(--color-neon)]"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Restart tour
                  </button>
                )}
              </div>
            </StencilPanel>
          );
        })}
      </div>

      {/* FAQ */}
      <StencilPanel kicker={<><HelpCircle className="h-3 w-3" /> Frequently Asked Questions</>}>
        <Accordion type="single" collapsible className="w-full">
          {FAQ.map((f, i) => (
            <AccordionItem value={`faq-${i}`} key={i} className="border-[var(--color-surface-border)]">
              <AccordionTrigger className="text-left text-sm font-semibold hover:text-[var(--color-neon)] hover:no-underline">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-[var(--color-ink-muted)] leading-relaxed">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </StencilPanel>
    </PageShell>
  );
}
