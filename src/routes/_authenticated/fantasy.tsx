import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/fantasy")({
  head: () => ({
    meta: [
      { title: "Fantasy XI — CSSEBets" },
      {
        name: "description",
        content:
          "Build one XI from the Premier League, La Liga and Serie A. Weekly rounds, cash prize pools and a season-long table.",
      },
      { property: "og:title", content: "Fantasy XI — CSSEBets" },
      {
        property: "og:description",
        content: "Mix players from three leagues, beat the deadline, win the weekly pot.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <Outlet />,
});
