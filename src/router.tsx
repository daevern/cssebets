import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { CsseLogoLoader } from "./components/brand/CsseLogoAnimated";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: () => <CsseLogoLoader />,
    defaultPendingMs: 200,
    defaultPendingMinMs: 500,
  });

  return router;
};

