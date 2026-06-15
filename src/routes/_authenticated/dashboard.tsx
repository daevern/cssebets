import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { ListChecks, History } from "lucide-react";
import { CsseLogo } from "@/components/brand/CsseMark";

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
      <div className="flex items-center justify-between">
        <CsseLogo size={24} />
        <span className="hidden sm:inline text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Competitive Strategy Starts Everywhere
        </span>
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
