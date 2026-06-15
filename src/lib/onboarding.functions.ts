import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getOnboardingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed_at, onboarding_skipped_at, tour_progress, onboarding_enabled")
      .eq("id", userId)
      .maybeSingle();
    const { data: settings } = await supabase
      .from("onboarding_settings")
      .select("enabled")
      .eq("id", 1)
      .maybeSingle();
    return {
      completedAt: (profile as any)?.onboarding_completed_at ?? null,
      skippedAt: (profile as any)?.onboarding_skipped_at ?? null,
      tourProgress: ((profile as any)?.tour_progress ?? {}) as Record<string, boolean>,
      userEnabled: (profile as any)?.onboarding_enabled ?? true,
      globalEnabled: (settings as any)?.enabled ?? true,
    };
  });

export const markTourComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ tourKey: z.string().min(1).max(64) }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("mark_tour_complete", { p_tour_key: data.tourKey });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markOnboardingComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("mark_onboarding_complete");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markOnboardingSkipped = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("mark_onboarding_skipped");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const logOnboardingEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        tourKey: z.string().min(1).max(64),
        event: z.enum(["started", "completed", "skipped", "step_viewed"]),
        stepIndex: z.number().int().min(0).max(50).nullable().optional(),
        metadata: z.record(z.string(), z.any()).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("log_onboarding_event", {
      p_tour_key: data.tourKey,
      p_event: data.event,
      p_step_index: data.stepIndex ?? null,
      p_metadata: data.metadata ?? {},
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminResetOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_reset_onboarding", { p_user_id: data.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetOnboardingEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ userId: z.string().uuid(), enabled: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_set_onboarding_enabled", {
      p_user_id: data.userId,
      p_enabled: data.enabled,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetGlobalOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ enabled: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_set_global_onboarding", { p_enabled: data.enabled });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getOnboardingStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_onboarding_completion_stats");
    if (error) throw new Error(error.message);
    return data as {
      total_users: number;
      completed: number;
      skipped: number;
      completion_rate: number;
      per_tour_completed: Record<string, number>;
    };
  });

export const adminListOnboardingUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ search: z.string().max(120).optional(), limit: z.number().int().min(1).max(200).default(50) }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("profiles")
      .select("id, display_name, public_reference, onboarding_completed_at, onboarding_skipped_at, onboarding_enabled, tour_progress")
      .order("onboarding_completed_at", { ascending: false, nullsFirst: true })
      .limit(data.limit);
    if (data.search && data.search.trim()) {
      const s = `%${data.search.trim()}%`;
      q = q.or(`display_name.ilike.${s},public_reference.ilike.${s}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      display_name: string | null;
      public_reference: string | null;
      onboarding_completed_at: string | null;
      onboarding_skipped_at: string | null;
      onboarding_enabled: boolean;
      tour_progress: Record<string, boolean>;
    }>;
  });
