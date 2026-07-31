import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  return roles.includes("admin") || roles.includes("super_admin");
}

export type PlReportInput = {
  environment?: "PRODUCTION" | "SIMULATION" | "TEST";
  from?: string | null;
  to?: string | null;
  basis?: "settlement" | "placement";
  products?: string[] | null;
  game?: string | null;
  sport?: "sports" | "arcade" | null;
  userId?: string | null;
  configVersion?: string | null;
};

/** Phase 9 — unified P/L report, sourced from posted accounting journals. */
export const getPlReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: PlReportInput) => d ?? {})
  .handler(async ({ context, data }) => {
    if (!(await isAdmin(context.supabase, context.userId))) throw new Error("Forbidden");

    const { data: report, error } = await context.supabase.rpc("accounting_pl_report" as any, {
      p_environment: data.environment ?? "PRODUCTION",
      p_from: data.from ?? null,
      p_to: data.to ?? null,
      p_basis: data.basis ?? "settlement",
      p_products: data.products?.length ? data.products : null,
      p_game: data.game || null,
      p_sport: data.sport || null,
      p_user: data.userId || null,
      p_config_version: data.configVersion || null,
    });
    if (error) throw new Error(error.message);
    return { report };
  });
