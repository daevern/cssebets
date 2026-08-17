import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/f1")({
  head: () => ({
    meta: [
      { title: "Formula 1 — CSSEBets" },
      { name: "description", content: "Grand Prix betting: race winner, podium, points, head-to-head, championship outrights." },
          { property: "og:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <Outlet />,
});
