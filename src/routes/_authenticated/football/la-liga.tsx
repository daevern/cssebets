import { createFileRoute } from "@tanstack/react-router";
import { FootballCompetitionPage } from "@/features/football/pages/FootballCompetitionPage";

export const Route = createFileRoute("/_authenticated/football/la-liga")({
  head: () => ({ meta: [{ title: "La Liga — CSSEBets" }] }),
  component: () => <FootballCompetitionPage code="LA_LIGA" />,
});
