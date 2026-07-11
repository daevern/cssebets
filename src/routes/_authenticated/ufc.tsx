import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/ufc")({
  head: () => ({
    meta: [
      { title: "UFC Fight Night — CSSEBets" },
      { name: "description", content: "Main-card UFC markets: moneyline, method of victory, round betting with live movement." },
    ],
  }),
  component: () => <Outlet />,
});
