/**
 * Server-side Sentry reporting for settlement / audit paths.
 * Uses @sentry/cloudflare so Workers never pull @sentry/node.
 */
import * as Sentry from "@sentry/cloudflare";
import { sentryEnabled } from "@/lib/sentry.config";

export function captureServerException(
  error: unknown,
  context: {
    area: string;
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  },
) {
  if (!sentryEnabled()) return;
  Sentry.withScope((scope) => {
    scope.setTag("area", context.area);
    if (context.tags) {
      for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, v);
    }
    if (context.extra) scope.setExtras(context.extra);
    Sentry.captureException(error);
  });
}

export function captureServerMessage(
  message: string,
  context: {
    area: string;
    level?: "info" | "warning" | "error";
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  },
) {
  if (!sentryEnabled()) return;
  Sentry.withScope((scope) => {
    scope.setTag("area", context.area);
    if (context.tags) {
      for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, v);
    }
    if (context.extra) scope.setExtras(context.extra);
    Sentry.captureMessage(message, context.level ?? "warning");
  });
}
