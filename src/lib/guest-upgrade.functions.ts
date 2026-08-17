import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * After an anonymous guest calls auth.updateUser(email/password), finalize
 * the conversion: demote to pending, clear demo balance, open production wallet.
 */
export const finalizeGuestUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ displayName: z.string().min(1).max(40).optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: result, error } = await (supabase as any).rpc("convert_guest_account", {
      p_display_name: data.displayName ?? null,
    });
    if (error) throw new Error(error.message ?? "Could not upgrade guest account.");

    try {
      const { notifyAdminsOfRegistration } = await import("@/lib/notifications.functions");
      await notifyAdminsOfRegistration({ data: { newUserId: userId } });
    } catch {
      /* non-fatal */
    }

    return { ok: true as const, result };
  });
