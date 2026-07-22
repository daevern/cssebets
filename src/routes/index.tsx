import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    const redirectToDashboard = () => {
      window.location.replace("/dashboard");
    };

    (async () => {
      try {
        const timeout = new Promise<"timeout">((resolve) =>
          window.setTimeout(() => resolve("timeout"), 2500),
        );
        const sessionResult = await Promise.race([supabase.auth.getSession(), timeout]);
        if (!active) return;
        if (sessionResult === "timeout") {
          setStatus("ready");
          return;
        }

        if (sessionResult.data.session) {
          redirectToDashboard();
          return;
        }

        const signInResult = await Promise.race([supabase.auth.signInAnonymously(), timeout]);
        if (!active) return;
        if (signInResult === "timeout") {
          setStatus("ready");
          return;
        }

        const { data: signInData, error } = signInResult;
        if (error || !signInData.session) throw error ?? new Error("No guest session returned");

        window.setTimeout(redirectToDashboard, 100);
        window.setTimeout(() => active && setStatus("ready"), 1800);
      } catch (err) {
        console.error("[guest-gate] guest session failed", err);
        if (active) setStatus("error");
      }
    })();

    const fallback = window.setTimeout(() => active && setStatus("ready"), 3500);
    return () => {
      active = false;
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--surface)] px-4 text-[var(--ink)]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-7 py-10 text-center">
        {status === "loading" ? <CsseLogoLoader /> : <div className="text-3xl font-black tracking-tight">CSSEBETS</div>}
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
            Demo account
          </p>
          <h1 className="text-3xl font-black leading-tight md:text-4xl">
            Enter the full matchday app.
          </h1>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-[var(--ink-muted)]">
            Browse football, F1, UFC, picks, wallet and markets with the same app layout.
          </p>
        </div>
        <div className="grid w-full gap-3">
          <a
            href="/dashboard"
            className="flex h-12 items-center justify-center border border-[var(--color-neon)] bg-[var(--color-neon)] px-5 text-sm font-black uppercase tracking-[0.18em] text-black"
          >
            Open app
          </a>
          <a
            href="/auth"
            className="flex h-12 items-center justify-center border border-[var(--surface-border)] px-5 text-sm font-black uppercase tracking-[0.18em] text-[var(--ink)]"
          >
            Sign in / register
          </a>
        </div>
        {status === "loading" ? (
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--ink-muted)]">
            Loading matchday
          </p>
        ) : status === "error" ? (
          <p className="text-xs text-[var(--ink-muted)]">
            Guest access is taking longer than expected. Tap Open app or sign in.
          </p>
        ) : null}
      </div>
    </div>
  );
}
