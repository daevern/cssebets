import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { ListChecks, Crown } from "lucide-react";
import { CsseMark } from "@/components/brand/CsseMark";

export const Route = createFileRoute("/_authenticated/bets")({
  head: () => ({
    meta: [
      { title: "Bets — cssebets" },
      { name: "description", content: "Place predictions on matches or the tournament winner." },
    ],
  }),
  component: BetsHub,
});

function BetsHub() {
  const tiles = [
    {
      to: "/matches",
      icon: ListChecks,
      label: "Matches",
      desc: "Bet on individual match outcomes",
    },
    {
      to: "/tournament-winner",
      icon: Crown,
      label: "Tournament Winner",
      desc: "Pick the tournament champion",
    },
  ] as const;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div className="flex items-center gap-3">
        <CsseMark className="h-9 w-9 text-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Bets</h1>
          <p className="text-sm text-muted-foreground">Pick a market to start.</p>
        </div>
      </div>

      <div data-tour="available-matches" className="grid gap-4 sm:grid-cols-2">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to as string} data-tour={t.to === "/matches" ? "bet-button" : undefined}>
            <Card className="p-5 transition hover:border-primary hover:shadow-lg">
              <t.icon className="mb-3 h-6 w-6 text-primary" />
              <div className="font-semibold">{t.label}</div>
              <div className="text-sm text-muted-foreground">{t.desc}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
