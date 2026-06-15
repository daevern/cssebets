import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useTour } from "@/components/onboarding/TourProvider";
import { TOURS } from "@/components/onboarding/tours.config";
import { Sparkles, Wallet, Banknote, Headset, ListChecks, BookOpen, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/help")({
  head: () => ({ meta: [{ title: "Help Center — cssebets" }] }),
  component: HelpCenter,
});

type Section = {
  id: string;
  title: string;
  icon: any;
  tourKey?: string;
  body: string;
  link?: { to: string; label: string };
};

const SECTIONS: Section[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: BookOpen,
    tourKey: "dashboard",
    body: "CSSEBets is a points-based prediction platform. After approval, you'll have a wallet, can request points, place bets on matches, track predictions, and request payouts on your winnings.",
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
  {
    q: "How do I get points?",
    a: "Open Wallet → Request Points, transfer funds using the displayed PointBank details and your unique reference ID, upload proof, and submit. An admin reviews and credits your account.",
  },
  {
    q: "Why was my bet locked?",
    a: "Bets lock at kickoff. Any pending bet placed after the kickoff time is rejected automatically.",
  },
  {
    q: "When do bets settle?",
    a: "As soon as the match result is finalized by an admin. Winning stakes are credited to your wallet immediately.",
  },
  {
    q: "Can I cancel a bet?",
    a: "You can edit the stake of a pending bet before kickoff. You cannot fully cancel placed bets — only adjust stake.",
  },
  {
    q: "How long do payouts take?",
    a: "Most payouts are processed within 24 hours. You'll get a notification at every status change.",
  },
  {
    q: "I forgot my password — what now?",
    a: "Use the password reset link on the login page, or contact support with your reference ID.",
  },
];

function HelpCenter() {
  const { startTour, startFullTour } = useTour();
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Help Center</h1>
          <p className="text-sm text-muted-foreground">Everything you need to use CSSEBets confidently.</p>
        </div>
        <Button onClick={startFullTour} className="gap-2">
          <Sparkles className="h-4 w-4" /> Restart full tour
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.id} className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h2 className="font-semibold text-lg">{s.title}</h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {s.link && (
                  <Button asChild size="sm" variant="outline">
                    <Link to={s.link.to as any}>{s.link.label}</Link>
                  </Button>
                )}
                {s.tourKey && TOURS[s.tourKey] && (
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => startTour(s.tourKey!)}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Restart this tour
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="p-5">
        <h2 className="font-semibold text-lg mb-3">Frequently Asked Questions</h2>
        <Accordion type="single" collapsible className="w-full">
          {FAQ.map((f, i) => (
            <AccordionItem value={`faq-${i}`} key={i}>
              <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Card>
    </div>
  );
}
