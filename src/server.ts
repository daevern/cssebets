import "./lib/error-capture";

import * as Sentry from "@sentry/cloudflare";
import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  sentryDsn,
  sentryEnvironment,
  sentryTracesSampleRate,
} from "./lib/sentry.config";
import { captureServerException } from "./lib/sentry.report.server";

type ServerEntry = {
  fetch: (request: Request, ...args: unknown[]) => Promise<Response> | Response;
};

let wrappedEntryPromise: Promise<ServerEntry> | undefined;

async function getWrappedServerEntry(): Promise<ServerEntry> {
  if (!wrappedEntryPromise) {
    wrappedEntryPromise = import("@tanstack/react-start/server-entry").then((m) => {
      const handler = (m.default ?? m) as ServerEntry;
      return wrapFetchWithSentry({
        fetch(request: Request) {
          return handler.fetch(request);
        },
      });
    });
  }
  return wrappedEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  const err = consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(err);
  captureServerException(err, { area: "ssr", tags: { kind: "h3_swallowed" } });
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const appHandler = {
  async fetch(request: Request, _env: unknown, _ctx: unknown) {
    try {
      const handler = await getWrappedServerEntry();
      const response = await handler.fetch(request);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      captureServerException(error, { area: "ssr", tags: { kind: "fetch_throw" } });
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};

export default Sentry.withSentry(
  (env) => {
    const envRecord = (env ?? {}) as Record<string, string | undefined>;
    return {
      dsn: envRecord.SENTRY_DSN || sentryDsn(),
      environment: envRecord.SENTRY_ENVIRONMENT || sentryEnvironment(),
      tracesSampleRate: sentryTracesSampleRate(),
      sendDefaultPii: false,
    };
  },
  appHandler as never,
);
