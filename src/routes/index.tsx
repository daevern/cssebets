import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { CsseLogoLoader } from "@/components/brand/CsseLogoAnimated";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      const { data: signInData, error } = await supabase.auth.signInAnonymously();
      if (error || !signInData.session) {
        throw redirect({ to: "/auth" });
      }
    }

    throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "CSSEBets – The FIFA World Cup 2026 Prediction Market" },
      {
        name: "description",
        content:
          "Trade live markets on every match, goal, lineup, and key moment with dynamic, community-driven pricing.",
      },
      { property: "og:title", content: "CSSEBets – The FIFA World Cup 2026 Prediction Market" },
      { property: "og:type", content: "website" },
      {
        property: "og:description",
        content:
          "Trade live markets on every match, goal, lineup, and key moment with dynamic, community-driven pricing.",
      },
      { property: "og:url", content: "https://cssebets.com/" },
      { property: "og:image", content: "https://cssebets.com/og-image.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://cssebets.com/og-image.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://cssebets.com/" }],
  }),
  component: GuestGate,
});

/**
 * Landing = anonymous guest gate.
 *
 * If the visitor already has a Supabase session (member, admin, or previous
 * anonymous guest), we hand them straight into the authenticated app. Otherwise
 * we silently mint an anonymous Supabase session (auto-provisioned as a
 * `member` in `handle_new_user`) so the visitor experiences the exact same
 * post-auth UI/UX — TopBar with balance, BottomNav, dashboard, /matches,
 * /f1/races, /ufc/fights, market pages, everything.
 *
 * When they later choose to Register from /auth, they can upgrade the
 * anonymous account into a permanent one (Supabase supports linking an
 * identity to an anonymous user via `updateUser`).
 */
function GuestGate() {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--surface)] text-[var(--ink)]">
      <div className="flex flex-col items-center gap-4">
        <CsseLogoLoader />
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--ink-muted)]">
          Loading matchday
        </p>
      </div>
    </div>
  );
}
