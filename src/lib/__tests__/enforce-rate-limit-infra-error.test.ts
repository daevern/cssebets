import { afterEach, describe, expect, it, vi } from "vitest";

// `supabaseAdmin` is a lazy proxy (see src/integrations/supabase/client.server.ts)
// that throws synchronously on first property access when server env vars
// (e.g. SUPABASE_SERVICE_ROLE_KEY) are missing/misconfigured — this is what a
// misconfigured local/preview environment looks like. That throw happens
// *before* `.rpc(...)` ever returns a `{ data, error }` result, so it's a
// different failure shape than an RPC-level error. `enforceRateLimit` must
// treat both the same way, otherwise a missing service-role key silently
// bypasses the fail-closed policy for money/auth actions (this exact bug
// was found via a browser walkthrough of the registration flow, where it
// looked like registration was completely broken with no error surfaced).
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin(): never {
    throw new Error(
      "Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY. Connect the backend.",
    );
  },
}));

describe("enforceRateLimit — supabaseAdmin construction throws", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("fails closed (RATE_LIMIT_UNAVAILABLE) for a fail-closed action like auth_attempt", async () => {
    const { enforceRateLimit } = await import("@/lib/rate-limit.functions");
    await expect(enforceRateLimit("email:test@example.com", "auth_attempt")).rejects.toThrow(
      "RATE_LIMIT_UNAVAILABLE",
    );
  });

  it("fails open (resolves) for a fail-open action like support_message", async () => {
    const { enforceRateLimit } = await import("@/lib/rate-limit.functions");
    await expect(enforceRateLimit("user:abc", "support_message")).resolves.toBeUndefined();
  });
});
