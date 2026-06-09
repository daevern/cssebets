import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (data ?? []).some((r: any) => r.role === "admin");
  if (!isAdmin) throw new Error("Admin only");
}

export const listPendingUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pendingRoles } = await supabaseAdmin
      .from("user_roles").select("user_id, created_at").eq("role", "pending");
    if (!pendingRoles?.length) return { users: [] };
    const ids = pendingRoles.map((r) => r.user_id);
    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("id, display_name").in("id", ids);
    return {
      users: pendingRoles.map((r) => ({
        id: r.user_id,
        display_name: profiles?.find((p) => p.id === r.user_id)?.display_name ?? "",
        created_at: r.created_at,
      })),
    };
  });

export const approveUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ targetUserId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.targetUserId).eq("role", "pending");
    const { error } = await supabaseAdmin.from("user_roles").upsert(
      { user_id: data.targetUserId, role: "member" },
      { onConflict: "user_id,role" }
    );
    if (error) throw new Error(error.message);

    // add to default league
    const { data: league } = await supabaseAdmin.from("leagues").select("id").limit(1).single();
    if (league) {
      await supabaseAdmin.from("league_members").upsert({ league_id: league.id, user_id: data.targetUserId });
    }

    await supabaseAdmin.from("audit_log").insert({
      user_id: userId, action: "user.approve", entity: "user", entity_id: data.targetUserId, metadata: {},
    });
    return { ok: true };
  });

export const makeAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ targetUserId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_roles").upsert(
      { user_id: data.targetUserId, role: "admin" },
      { onConflict: "user_id,role" }
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Manually create a match (used until API is wired or as a fallback)
const MatchSchema = z.object({
  id: z.string().uuid().optional(),
  home_team: z.string().min(1).max(80),
  away_team: z.string().min(1).max(80),
  kickoff_at: z.string(),
  stage: z.string().max(40).optional().nullable(),
  group_name: z.string().max(10).optional().nullable(),
  reference_odds: z.object({
    home: z.number().min(1).max(1000),
    draw: z.number().min(1).max(1000),
    away: z.number().min(1).max(1000),
  }).optional().nullable(),
});

export const upsertMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => MatchSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: any = {
      home_team: data.home_team,
      away_team: data.away_team,
      kickoff_at: data.kickoff_at,
      stage: data.stage ?? null,
      group_name: data.group_name ?? null,
      reference_odds: data.reference_odds ?? null,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("matches").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    } else {
      const { data: inserted, error } = await supabaseAdmin.from("matches").insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      return { id: inserted.id };
    }
  });

export const deleteMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("matches").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Settle a finished match: set score & status, then settle predictions.
const SettleSchema = z.object({
  matchId: z.string().uuid(),
  homeScore: z.number().int().min(0).max(50),
  awayScore: z.number().int().min(0).max(50),
});

export const settleMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SettleSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const winner = data.homeScore > data.awayScore ? "HOME" : data.homeScore < data.awayScore ? "AWAY" : "DRAW";

    const { error: upErr } = await supabaseAdmin.from("matches").update({
      home_score: data.homeScore,
      away_score: data.awayScore,
      status: "finished",
      winner,
      updated_at: new Date().toISOString(),
    }).eq("id", data.matchId);
    if (upErr) throw new Error(upErr.message);

    const { settlePredictionsForMatch } = await import("@/lib/settlement.server");
    const settled = await settlePredictionsForMatch(data.matchId, data.homeScore, data.awayScore);

    await supabaseAdmin.from("audit_log").insert({
      user_id: userId, action: "match.settle", entity: "match", entity_id: data.matchId,
      metadata: { homeScore: data.homeScore, awayScore: data.awayScore },
    });

    return { settled };
  });


// Mark a match as cancelled/void and refund all pending stakes.
export const voidMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ matchId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("matches").update({
      status: "cancelled", updated_at: new Date().toISOString(),
    }).eq("id", data.matchId);

    const { data: preds } = await supabaseAdmin
      .from("predictions").select("*").eq("match_id", data.matchId).eq("status", "pending");

    for (const p of preds ?? []) {
      await supabaseAdmin.from("predictions").update({
        status: "void", points: 0, settled_at: new Date().toISOString(),
      }).eq("id", p.id);

      await supabaseAdmin.rpc("wallet_apply_change", {
        p_user_id: p.user_id,
        p_type: "refund",
        p_amount: Number(p.virtual_stake),
        p_reference_type: "bet_settlement",
        p_reference_id: p.id,
        p_note: `Refund: match voided`,
      });
    }

    await supabaseAdmin.from("audit_log").insert({
      user_id: userId, action: "match.void", entity: "match", entity_id: data.matchId,
      metadata: { refunded: preds?.length ?? 0 },
    });
    return { refunded: preds?.length ?? 0 };
  });

// Generate simple reference odds based on team strength heuristic.
// Free-tier football-data.org does not provide bookmaker odds.
function generateOdds(): { home: number; draw: number; away: number } {
  // Balanced reference odds; admins can edit per-match later if desired.
  return { home: 2.1, draw: 3.3, away: 3.4 };
}

// Sync fixtures from football-data.org across all competitions the API key
// has access to (free tier: WC, CL, EC, PL, BL1, SA, PD, FL1, DED, PPL, CLI, BSA).
// Pulls a window of upcoming + live + recently-finished matches.
export const testFootballData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const raw = process.env.FOOTBALL_DATA_API_KEY;
    const apiKey = raw?.trim();
    console.log(`[football-data:test] key_exists=${!!apiKey} key_length=${apiKey?.length ?? 0} raw_length=${raw?.length ?? 0}`);
    if (!apiKey) {
      return { keyExists: false, keyLength: 0, status: 0, body: "FOOTBALL_DATA_API_KEY is not set" };
    }
    const res = await fetch("https://api.football-data.org/v4/competitions", {
      headers: { "X-Auth-Token": apiKey },
    });
    const body = await res.text();
    console.log(`[football-data:test] GET /competitions status=${res.status}`);
    console.log(`[football-data:test] body=${body.slice(0, 1000)}`);
    return { keyExists: true, keyLength: apiKey.length, status: res.status, body: body.slice(0, 2000) };
  });

export const syncFootballData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { runFootballDataSync } = await import("@/lib/sync.server");
    return runFootballDataSync({ userId });
  });

