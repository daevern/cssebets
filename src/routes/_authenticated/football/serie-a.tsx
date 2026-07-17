import { createFileRoute } from "@tanstack/react-router";
import { FootballCompetitionPage } from "@/features/football/pages/FootballCompetitionPage";

export const Route = createFileRoute("/_authenticated/football/serie-a")({
  head: () => ({ meta: [{ title: "Serie A — CSSEBets" }] }),
  component: () => <FootballCompetitionPage code="SERIE_A" />,
});
