// Public (any authenticated user) trigger for football-data sync.
// Used by the matches page on mount + on a short interval so finished
// matches are reflected without waiting for an admin to click Sync.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const refreshMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runFootballDataSync } = await import("@/lib/sync.server");
    return runFootballDataSync({ userId: context.userId });
  });
