import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CsseLogoLoader } from "@/components/brand/CsseLogoAnimated";

export const Route = createFileRoute("/")({
  ssr: false,
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
  const flowRef = useRef(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const flowId = flowRef.current + 1;
    flowRef.current = flowId;
    let active = true;
    const isCurrent = () => active && flowRef.current === flowId;

    // Hard-navigate so _authenticated's beforeLoad re-reads localStorage
    // with the freshly-persisted anonymous session (router.navigate can
    // race the session write and bounce back to /auth).
    const goto = (path: string) => {
      if (!isCurrent()) return;
      window.location.replace(path);
    };

    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!isCurrent()) return;

        if (sessionData.session) {
          goto("/dashboard");
          return;
        }

        const { data: signInData, error: signInErr } =
          await supabase.auth.signInAnonymously();
        if (!isCurrent()) return;
        if (signInErr) throw signInErr;
        if (!signInData.session) throw new Error("no session returned");

        // Give supabase-js a tick to write the session to localStorage before
        // the destination route calls getUser().
        await new Promise((r) => setTimeout(r, 50));
        goto("/dashboard");
      } catch (err: any) {
        if (!isCurrent()) return;
        console.error("[guest-gate] anon sign-in failed:", err);
        setError(err?.message ?? "Could not start guest session");
        goto("/auth");
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--surface)] text-[var(--ink)]">
      <div className="flex flex-col items-center gap-4">
        <CsseLogoLoader />
        {error ? (
          <p className="text-xs text-[var(--ink-muted)]">Redirecting to sign in…</p>
        ) : (
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--ink-muted)]">
            Loading matchday
          </p>
        )}
      </div>
    </div>
  );
}
