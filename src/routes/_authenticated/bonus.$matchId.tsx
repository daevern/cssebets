import { createFileRoute, Link } from "@tanstack/react-router";
import { FootballMatchDetailsPage } from "@/features/football/pages/FootballMatchDetailsPage";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bonus/$matchId")({
  head: () => ({ meta: [{ title: "Bonus Match — CSSEBets" }] }),
  component: BonusMatchRoute,
});

function BonusMatchRoute() {
  const { matchId } = Route.useParams();
  return (
    <div>
      <div className="px-4 pt-4">
        <Link
          to="/bonus"
          className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-[var(--ink-muted)] hover:text-[var(--neon)] transition-colors"
        >
          <ChevronLeft className="h-3 w-3" />
          Sports › Bonus
        </Link>
      </div>
      <FootballMatchDetailsPage matchId={matchId} />
    </div>
  );
}
