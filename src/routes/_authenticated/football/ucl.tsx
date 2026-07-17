import { createFileRoute } from "@tanstack/react-router";
import { FootballCompetitionPage } from "@/features/football/pages/FootballCompetitionPage";

export const Route = createFileRoute("/_authenticated/football/ucl")({
  head: () => ({ meta: [{ title: "UEFA Champions League — CSSEBets" }] }),
  component: () => <FootballCompetitionPage code="UCL" />,
});
