import { createStart, createMiddleware } from "@tanstack/react-start";
import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from "@sentry/tanstackstart-react";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { captureServerException } from "@/lib/sentry.report.server";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    captureServerException(error, { area: "request_middleware" });
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  // Sentry first so request/server-fn failures are attributed before auth.
  functionMiddleware: [sentryGlobalFunctionMiddleware, attachSupabaseAuth],
  requestMiddleware: [sentryGlobalRequestMiddleware, errorMiddleware],
}));
