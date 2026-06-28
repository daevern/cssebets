import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  return roles.includes("admin") || roles.includes("super_admin");
}

export const runReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context.supabase, context.userId))) {
      throw new Error("Forbidden");
    }
    const { data, error } = await context.supabase.rpc("run_reconciliation_check" as any);
    if (error) throw new Error(error.message);
    return { report: data };
  });
