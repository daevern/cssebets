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
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "cssebets — Private World Cup Predictions" },
      { name: "description", content: "cssebets: private World Cup 2026 prediction pool for friends." },
      { property: "og:title", content: "cssebets — Private World Cup Predictions" },
      { property: "og:description", content: "cssebets: private World Cup 2026 prediction pool for friends." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "cssebets — Private World Cup Predictions" },
      { name: "twitter:description", content: "cssebets: private World Cup 2026 prediction pool for friends." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9c868361-deda-4fd6-ae97-260286bf8f25/id-preview-00ec4b3a--9a7d8431-a21b-4be7-aa5c-77435c44e420.lovable.app-1780916547939.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9c868361-deda-4fd6-ae97-260286bf8f25/id-preview-00ec4b3a--9a7d8431-a21b-4be7-aa5c-77435c44e420.lovable.app-1780916547939.png" },
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
      {
        rel: "icon",
        type: "image/svg+xml",
        href:
          "data:image/svg+xml;utf8," +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0b1220"/><path d="M24 7 L11 7 L4 16 L11 25 L24 25" fill="none" stroke="#ffffff" stroke-width="3.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 21 L21 14 L27 21" fill="none" stroke="#22e08a" stroke-width="3.25" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
          ),
      },
      {
        rel: "apple-touch-icon",
        href:
          "data:image/svg+xml;utf8," +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0b1220"/><path d="M24 7 L11 7 L4 16 L11 25 L24 25" fill="none" stroke="#ffffff" stroke-width="3.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 21 L21 14 L27 21" fill="none" stroke="#22e08a" stroke-width="3.25" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
          ),
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
      <InitialLoadGate>
        <Suspense fallback={<CsseLogoLoader />}>
          <Outlet />
        </Suspense>
      </InitialLoadGate>
      <Toaster richColors position="top-center" theme="dark" />
    </QueryClientProvider>
  );
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
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);
  return null;
}
