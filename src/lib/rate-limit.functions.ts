import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Rate-limit windows: action -> { max, windowSeconds }
export const RATE_LIMITS = {
  bet_placement: { max: 10, windowSeconds: 60 },
  point_request_submit: { max: 3, windowSeconds: 3600 },
  proof_upload: { max: 5, windowSeconds: 3600 },
  support_message: { max: 20, windowSeconds: 600 },
  auth_attempt: { max: 10, windowSeconds: 600 },
  arcade_drop: { max: 30, windowSeconds: 60 },
  arcade_spin: { max: 30, windowSeconds: 60 },
  arcade_treasure: { max: 60, windowSeconds: 60 },
  blackjack_action: { max: 90, windowSeconds: 60 },
  arcade_rps: { max: 90, windowSeconds: 60 },
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;

/**
 * Money + auth actions fail closed when the rate-limit RPC is unavailable.
 * Non-money paths (support) may fail open so messaging stays available.
 *
 * Policy (Phase A): availability must not bypass betting / arcade / wallet /
 * auth throttles under DB stress or attack.
 */
const FAIL_CLOSED_ACTIONS = new Set<RateLimitAction>([
  "bet_placement",
  "point_request_submit",
  "proof_upload",
  "auth_attempt",
  "arcade_drop",
  "arcade_spin",
  "arcade_treasure",
  "blackjack_action",
  "arcade_rps",
]);

export function rateLimitFailsClosedOnInfraError(action: RateLimitAction): boolean {
  return FAIL_CLOSED_ACTIONS.has(action);
}

/** True for exceeded quota or fail-closed infra errors from enforceRateLimit. */
export function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg === "RATE_LIMITED" || msg === "RATE_LIMIT_UNAVAILABLE";
}

/**
 * Server-only helper. Throws `RATE_LIMITED` when exceeded.
 * Callers MUST already be inside a server-fn handler (uses supabaseAdmin).
 */
export async function enforceRateLimit(scope: string, action: RateLimitAction) {
  const cfg = RATE_LIMITS[action];
  // `supabaseAdmin` is a lazy proxy that throws synchronously (outside the
  // `{ data, error }` result) if server env vars (e.g. SUPABASE_SERVICE_ROLE_KEY)
  // are missing/misconfigured. Without this try/catch that throw bypasses the
  // fail-open/fail-closed policy below entirely and surfaces as a raw,
  // unhandled infra error to every caller (bet placement, arcade, auth
  // registration, etc.) instead of the intended RATE_LIMIT_UNAVAILABLE /
  // fail-open behavior. Treat it exactly like an RPC-level error.
  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    const { rpcCheckRateLimit } = await import("@/lib/supabase-rpc.server");
    const result = await rpcCheckRateLimit({
      p_scope: scope,
      p_action: action,
      p_max: cfg.max,
      p_window_seconds: cfg.windowSeconds,
    });
    data = result.data;
    error = result.error;
  } catch (e) {
    error = { message: e instanceof Error ? e.message : String(e) };
  }
  if (error) {
    console.error("[rate-limit] check failed", action, scope, error.message);
    if (rateLimitFailsClosedOnInfraError(action)) {
      throw new Error("RATE_LIMIT_UNAVAILABLE");
    }
    // Fail open only for non-money actions (e.g. support_message).
    return;
  }
  if (data === false) {
    throw new Error("RATE_LIMITED");
  }
}

/** Public server fn — callable from the login/register pages before submission. */
export const checkAuthRateLimit = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({
      email: z.string().trim().max(255).optional().transform((v) => (v ? v.toLowerCase() : undefined)),
      phone: z.string().trim().max(40).optional(),
    }).refine((v) => v.email || v.phone, "email or phone required").parse(i),
  )
  .handler(async ({ data }) => {
    const scopes: string[] = [];
    if (data.email) scopes.push(`email:${data.email.toLowerCase()}`);
    if (data.phone) scopes.push(`phone:${data.phone.replace(/\D/g, "")}`);
    for (const scope of scopes) {
      try {
        await enforceRateLimit(scope, "auth_attempt");
      } catch (e) {
        const msg = (e as Error).message;
        if (msg === "RATE_LIMITED" || msg === "RATE_LIMIT_UNAVAILABLE") {
          throw new Error("Too many requests. Please try again later.");
        }
        throw e;
      }
    }
    return { ok: true };
  });
