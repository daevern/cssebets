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

    const { data: preds } = await supabaseAdmin
      .from("predictions").select("*").eq("match_id", data.matchId).eq("status", "pending");

    for (const p of preds ?? []) {
      let won = false;
      let points = 0;
      if (p.market === "result") {
        won = p.outcome === winner;
        if (won) points = 3;
      } else if (p.market === "correct_score") {
        won = p.outcome === `${data.homeScore}-${data.awayScore}`;
        if (won) points = 5;
      } else if (p.market === "total_goals") {
        // outcome like "OVER_2.5" or "UNDER_2.5"
        const m = /^(OVER|UNDER)_(\d+(\.\d+)?)$/.exec(p.outcome);
        if (m) {
          const total = data.homeScore + data.awayScore;
          const line = parseFloat(m[2]);
          won = m[1] === "OVER" ? total > line : total < line;
          if (won) points = 2;
        }
      } else if (p.market === "btts") {
        const both = data.homeScore > 0 && data.awayScore > 0;
        won = (p.outcome === "YES" && both) || (p.outcome === "NO" && !both);
        if (won) points = 2;
      }

      await supabaseAdmin.from("predictions").update({
        status: won ? "won" : "lost",
        points,
        settled_at: new Date().toISOString(),
      }).eq("id", p.id);
    }

    await supabaseAdmin.from("audit_log").insert({
      user_id: userId, action: "match.settle", entity: "match", entity_id: data.matchId,
      metadata: { homeScore: data.homeScore, awayScore: data.awayScore },
    });

    return { settled: preds?.length ?? 0 };
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
export const syncFootballData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const apiKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
    if (!apiKey) {
      return {
        upserted: 0,
        total: 0,
        live: 0,
        warning: "Football-Data API key is not configured yet. Existing matches remain available.",
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    const from = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days back (catch live/just-finished)
    const to = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days ahead
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    // /v4/matches returns matches across ALL competitions the key has access to.
    const url = `https://api.football-data.org/v4/matches?dateFrom=${fmt(from)}&dateTo=${fmt(to)}`;
    const res = await fetch(url, { headers: { "X-Auth-Token": apiKey } });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Football-Data sync failed ${res.status}: ${body.slice(0, 500)}`);
      await supabaseAdmin.from("audit_log").insert({
        user_id: userId,
        action: "matches.sync_failed",
        entity: "matches",
        entity_id: null,
        metadata: { status: res.status, body: body.slice(0, 500) },
      });
      return {
        upserted: 0,
        total: 0,
        live: 0,
        warning: res.status === 400 || res.status === 401
          ? "Football-Data rejected the API token. Existing matches are still available; update FOOTBALL_DATA_API_KEY with a valid token and sync again."
          : `Football-Data sync failed (${res.status}). Existing matches are still available.`,
      };
    }
    const json = (await res.json()) as { matches?: any[] };
    const matches = json.matches ?? [];

    let upserted = 0;
    let live = 0;
    for (const m of matches) {
      const status: "scheduled" | "live" | "finished" | "postponed" | "cancelled" =
        m.status === "FINISHED"
          ? "finished"
          : m.status === "IN_PLAY" || m.status === "PAUSED" || m.status === "LIVE"
            ? "live"
            : m.status === "POSTPONED"
              ? "postponed"
              : m.status === "CANCELLED" || m.status === "SUSPENDED"
                ? "cancelled"
                : "scheduled";
      if (status === "live") live++;

      // Preserve existing reference_odds if already set (admin may have edited).
      const { data: existing } = await supabaseAdmin
        .from("matches")
        .select("reference_odds")
        .eq("external_id", String(m.id))
        .maybeSingle();

      const competition = m.competition?.name ?? null;
      const stageLabel = m.stage
        ? competition
          ? `${competition} · ${m.stage}`
          : m.stage
        : competition;

      const payload = {
        external_id: String(m.id),
        stage: stageLabel,
        group_name: m.group ?? null,
        home_team: m.homeTeam?.name ?? "TBD",
        away_team: m.awayTeam?.name ?? "TBD",
        home_crest: m.homeTeam?.crest ?? null,
        away_crest: m.awayTeam?.crest ?? null,
        kickoff_at: m.utcDate,
        status,
        home_score: m.score?.fullTime?.home ?? null,
        away_score: m.score?.fullTime?.away ?? null,
        reference_odds: existing?.reference_odds ?? generateOdds(),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabaseAdmin
        .from("matches")
        .upsert(payload, { onConflict: "external_id" });
      if (!error) upserted++;
    }

    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      action: "matches.sync",
      entity: "matches",
      entity_id: null,
      metadata: { upserted, total: matches.length, live },
    });

    return { upserted, total: matches.length, live };
  });
