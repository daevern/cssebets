import { createFileRoute } from "@tanstack/react-router";
import { FootballCompetitionPage } from "@/features/football/pages/FootballCompetitionPage";

export const Route = createFileRoute("/_authenticated/football/epl")({
  head: () => ({ meta: [{ title: "English Premier League — CSSEBets" }] }),
  component: () => <FootballCompetitionPage code="EPL" />,
});
