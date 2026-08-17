import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { CsseLogoLoader } from "@/components/brand/CsseLogoAnimated";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { captureReferralFromUrl } from "@/lib/referral-code";
import { Toaster } from "sonner";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { useAuth } from "@/hooks/use-auth";
import { DemoWalletBootstrap } from "@/components/wallet/DemoWalletBootstrap";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "CSSEBets – Sports Prediction Markets & Arcade Games" },
      { name: "description", content: "Trade live prediction markets on football, F1 and UFC, or play provably fair arcade games. One wallet, real-time odds, and community-driven pricing." },
      { property: "og:title", content: "CSSEBets – Sports Prediction Markets & Arcade Games" },
      { property: "og:description", content: "Trade live prediction markets on football, F1 and UFC, or play provably fair arcade games. One wallet, real-time odds, and community-driven pricing." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "CSSEBets" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "CSSEBets – Sports Prediction Markets & Arcade Games" },
      { name: "twitter:description", content: "Trade live prediction markets on football, F1 and UFC, or play provably fair arcade games. One wallet, real-time odds, and community-driven pricing." },
      { name: "theme-color", content: "#020806" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "cssebets" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },

      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://cssebets.com/#organization",
              name: "CSSEBets",
              url: "https://cssebets.com/",
              description:
                "Prediction markets on football, F1 and UFC, plus provably fair arcade games.",
              logo: "https://cssebets.com/og-image.jpg",
            },
            {
              "@type": "WebSite",
              "@id": "https://cssebets.com/#website",
              name: "CSSEBets",
              url: "https://cssebets.com/",
              description:
                "Trade live prediction markets on football, F1 and UFC, or play provably fair arcade games. One wallet, real-time odds, and community-driven pricing.",
              publisher: { "@id": "https://cssebets.com/#organization" },
            },
          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => { captureReferralFromUrl(); }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSync />
      <DemoWalletBootstrap />
      <InitialLoadGate>
        <Suspense fallback={<CsseLogoLoader />}>
          <Outlet />
        </Suspense>
      </InitialLoadGate>
      <InstallPromptGate />
      <Toaster richColors position="top-center" theme="dark" />
    </QueryClientProvider>
  );
}

function InstallPromptGate() {
  const { user } = useAuth();
  if (!user) return null;
  if ((user as any)?.is_anonymous === true) return null;
  return <InstallPrompt />;
}

function InitialLoadGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Hold for one full morph cycle (~2.6s) on first mount so the
    // brand animation always completes and resolves to the logo
    // before the app is revealed.
    const t = setTimeout(() => setReady(true), 2800);
    return () => clearTimeout(t);
  }, []);
  if (!ready) return <CsseLogoLoader />;
  return <>{children}</>;
}

function AuthSync() {
  const router = useRouter();
  const queryClient = Route.useRouteContext().queryClient;
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event === "SIGNED_OUT") {
        // Prevent prior user's cached data from being shown to the next user
        // who signs in on the same browser.
        queryClient.clear();
      } else {
        queryClient.invalidateQueries();
      }
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);
  return null;
}
