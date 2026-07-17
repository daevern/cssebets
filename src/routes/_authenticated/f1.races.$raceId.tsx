import { createFileRoute } from "@tanstack/react-router";
import { F1RaceDetailsPage } from "@/features/f1/pages/F1RaceDetailsPage";

export const Route = createFileRoute("/_authenticated/f1/races/$raceId")({
  head: () => ({ meta: [{ title: "F1 Race — CSSEBets" }] }),
  component: RaceRoute,
});

function RaceRoute() {
  const { raceId } = Route.useParams();
  return <F1RaceDetailsPage raceId={raceId} />;
}
