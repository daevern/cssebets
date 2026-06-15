import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Rate-limit windows: action -> { max, windowSeconds }
export const RATE_LIMITS = {
  bet_placement: { max: 10, windowSeconds: 60 },
  point_request_submit: { max: 3, windowSeconds: 3600 },
  proof_upload: { max: 5, windowSeconds: 3600 },
  support_message: { max: 20, windowSeconds: 600 },
  auth_attempt: { max: 10, windowSeconds: 600 },
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;

/**
 * Server-only helper. Throws `RATE_LIMITED` when exceeded.
 * Callers MUST already be inside a server-fn handler (uses supabaseAdmin).
 */
export async function enforceRateLimit(scope: string, action: RateLimitAction) {
  const cfg = RATE_LIMITS[action];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("check_rate_limit", {
    p_scope: scope,
    p_action: action,
    p_max: cfg.max,
    p_window_seconds: cfg.windowSeconds,
  });
  if (error) {
    // Fail open on infra error rather than block the entire platform,
    // but surface it in logs.
    console.error("[rate-limit] check failed", action, scope, error.message);
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
        if ((e as Error).message === "RATE_LIMITED") {
          throw new Error("Too many requests. Please try again later.");
        }
        throw e;
      }
    }
    return { ok: true };
  });
