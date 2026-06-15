import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Trophy, ListChecks, History } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "cssebets" },
      { name: "description", content: "Private prediction pool for the 2026 World Cup." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const tiles = [
    { to: "/bets", icon: ListChecks, label: "BET", desc: "Matches | Tournament-winner" },
    { to: "/my-predictions", icon: History, label: "PICKS", desc: "Track your bets" },
  ] as const;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div className="flex items-center gap-3">
        <Trophy className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">cssebets</h1>
        </div>
      </div>
      <div data-tour="quick-actions" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to as string}>
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
