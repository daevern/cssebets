import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Trophy, ListChecks, History, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "World Cup 2026 Pool" },
      { name: "description", content: "Private prediction pool for the 2026 World Cup." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const tiles = [
    { to: "/matches", icon: ListChecks, label: "Matches", desc: "Browse fixtures & predict" },
    { to: "/my-predictions", icon: History, label: "My Predictions", desc: "Track your entries" },
    { to: "/leaderboard", icon: BarChart3, label: "Leaderboard", desc: "Pool standings" },
  ] as const;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div className="flex items-center gap-3">
        <Trophy className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">World Cup 2026 Pool</h1>
          <p className="text-sm text-muted-foreground">Predict. Compete. Brag.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          // @ts-expect-error routes are added in a later step
          <Link key={t.to} to={t.to}>
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
