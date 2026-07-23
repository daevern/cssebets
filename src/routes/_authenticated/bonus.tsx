import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/bonus")({
  head: () => ({
    meta: [
      { title: "Bonus Leagues — CSSEBets" },
      {
        name: "description",
        content: "Bet on MLS and Brasileirão Série A. Live odds, match markets and settlement powered by API-Football.",
      },
      { property: "og:title", content: "Bonus Leagues — CSSEBets" },
      {
        property: "og:description",
        content: "MLS and Brasileirão markets updated in real time.",
      },
    ],
  }),
  component: () => <Outlet />,
});
