import process from "node:process";
import { timingSafeEqual } from "node:crypto";

/**
 * Shared auth for `/api/public/hooks/*` cron endpoints.
 *
 * Callers (pg_cron / net.http_post) must send either:
 *   Authorization: Bearer <CRON_HOOK_SECRET>
 *   x-cron-secret: <CRON_HOOK_SECRET>
 *
 * Fail-closed when CRON_HOOK_SECRET is unset in production.
 * Non-production allows through with a warning so local/dev still works.
 */

export function extractCronSecret(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match?.[1]?.trim()) return match[1].trim();
  }
  const header = request.headers.get("x-cron-secret");
  if (header?.trim()) return header.trim();
  return null;
}

/** Constant-time string compare; length mismatch is not equal. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function unauthorizedCronResponse(): Response {
  return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

export type CronAuthOptions = {
  /** Override env secret (tests). */
  secret?: string | null;
  /** Override NODE_ENV (tests). */
  nodeEnv?: string;
};

export type CronAuthResult = { ok: true } | { ok: false; response: Response };

/**
 * Pure decision helper — preferred for unit tests.
 * Does not log the secret.
 */
export function authorizeCronRequest(
  request: Request,
  opts: CronAuthOptions = {},
): CronAuthResult {
  const secret = (opts.secret !== undefined ? opts.secret : process.env.CRON_HOOK_SECRET)?.trim() ?? "";
  const nodeEnv = opts.nodeEnv ?? process.env.NODE_ENV ?? "production";

  if (!secret) {
    if (nodeEnv !== "production") {
      console.warn("[cron-auth] CRON_HOOK_SECRET unset — allowing in non-production");
      return { ok: true };
    }
    return { ok: false, response: unauthorizedCronResponse() };
  }

  const supplied = extractCronSecret(request);
  if (!supplied || !timingSafeEqualString(supplied, secret)) {
    return { ok: false, response: unauthorizedCronResponse() };
  }
  return { ok: true };
}

/** Returns a 401 Response when denied, otherwise null. */
export function requireCronAuth(request: Request, opts?: CronAuthOptions): Response | null {
  const result = authorizeCronRequest(request, opts);
  return result.ok ? null : result.response;
}
