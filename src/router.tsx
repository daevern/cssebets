import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import * as Sentry from "@sentry/tanstackstart-react";
import { routeTree } from "./routeTree.gen";
import { CsseLogoLoader } from "./components/brand/CsseLogoAnimated";
import {
  sentryDsn,
  sentryEnvironment,
  sentryTracesSampleRate,
} from "./lib/sentry.config";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: () => <CsseLogoLoader />,
    defaultPendingMs: 400,
    defaultPendingMinMs: 120,
  });

  if (!router.isServer) {
    const dsn = sentryDsn();
    if (dsn) {
      Sentry.init({
        dsn,
        environment: sentryEnvironment(),
        tracesSampleRate: sentryTracesSampleRate(),
        sendDefaultPii: false,
        integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
      });
    }
  }

  return router;
};
