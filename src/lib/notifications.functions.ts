import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Client-safe: expose the VAPID public key so browsers can subscribe.
export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return { publicKey: process.env.VAPID_PUBLIC_KEY || "" };
});

const SubSchema = z.object({
  endpoint: z.string().url().max(2000),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
  userAgent: z.string().max(400).optional().nullable(),
});

export const subscribeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SubSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .upsert(
        {
          user_id: context.userId,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth: data.auth,
          user_agent: data.userAgent ?? null,
          revoked_at: null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" }
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unsubscribeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ endpoint: z.string().url() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", context.userId)
      .eq("endpoint", data.endpoint);
    return { ok: true };
  });

export const listMyDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, user_agent, created_at, last_seen_at")
      .eq("user_id", context.userId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    return { devices: data ?? [] };
  });

export const getMyNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("notification_preferences")
      .select("push_enabled, email_enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      push_enabled: data?.push_enabled ?? true,
      email_enabled: data?.email_enabled ?? true,
    };
  });

export const updateMyNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ push_enabled: z.boolean().optional(), email_enabled: z.boolean().optional() }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const update: any = { user_id: context.userId, updated_at: new Date().toISOString() };
    if (typeof data.push_enabled === "boolean") update.push_enabled = data.push_enabled;
    if (typeof data.email_enabled === "boolean") update.email_enabled = data.email_enabled;
    const { error } = await supabaseAdmin
      .from("notification_preferences")
      .upsert(update, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Called from register.tsx after a successful sign-up to notify admins.
// This is the ONE place where the client kicks off a notification;
// it fires only after supabase.auth.signUp resolved successfully.
export const notifyAdminsOfRegistration = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ newUserId: z.string().uuid() }).parse(i)
  )
  .handler(async ({ data }) => {
    const { dispatchNotification } = await import("@/lib/notifications.server");
    await dispatchNotification({
      eventType: "admin_new_registration",
      relatedRecordType: "user",
      relatedRecordId: data.newUserId,
    });
    return { ok: true };
  });
