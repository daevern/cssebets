// Live ops pulse: active users, balances, WAL rate, checkpoint frequency.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const READ_TIERS = ["admin", "super_admin", "viewer"];

export type LivePulse = {
  captured_at: string;
  active_users: number;
  total_balance: number;
  db_connections: number;
  wal_bytes: number;
  wal_bytes_per_min: number | null;
  checkpoints_total: number;
  checkpoints_per_hour: number | null;
  sample_gap_seconds: number | null;
  history: Array<{
    captured_at: string;
    active_users: number;
    total_balance: number;
    wal_bytes: number;
  }>;
};

export const getLivePulse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LivePulse> => {
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (roleRows ?? []).map((r: any) => r.role as string);
    if (!roles.some((r) => READ_TIERS.includes(r))) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("admin_live_pulse" as any);
    if (error) throw new Error(error.message);
    return data as unknown as LivePulse;
  });
