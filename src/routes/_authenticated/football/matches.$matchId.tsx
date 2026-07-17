import { createFileRoute } from "@tanstack/react-router";
import { FootballMatchDetailsPage } from "@/features/football/pages/FootballMatchDetailsPage";

export const Route = createFileRoute("/_authenticated/football/matches/$matchId")({
  head: () => ({ meta: [{ title: "Match — CSSEBets" }] }),
  component: MatchRoute,
});

function MatchRoute() {
  const { matchId } = Route.useParams();
  return <FootballMatchDetailsPage matchId={matchId} />;
}
