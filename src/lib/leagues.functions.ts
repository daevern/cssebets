import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireApprovedMember } from "@/lib/access-control";

function inviteCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export const listMyLeagues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireApprovedMember(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: memberships, error } = await (supabaseAdmin as any)
      .from("league_members")
      .select("league_id, joined_at, leagues(id, name, invite_code, created_at, created_by)")
      .eq("user_id", context.userId)
      .order("joined_at", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      leagues: (memberships ?? []).map((m: any) => ({
        id: m.leagues?.id ?? m.league_id,
        name: m.leagues?.name ?? "League",
        inviteCode: m.leagues?.invite_code ?? null,
        joinedAt: m.joined_at,
        createdBy: m.leagues?.created_by ?? null,
      })),
    };
  });

export const createLeague = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ name: z.string().trim().min(2).max(48) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireApprovedMember(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let code = inviteCode();
    for (let i = 0; i < 5; i++) {
      const { data: league, error } = await (supabaseAdmin as any)
        .from("leagues")
        .insert({
          name: data.name,
          created_by: context.userId,
          invite_code: code,
        })
        .select("id, name, invite_code")
        .single();
      if (!error && league) {
        await (supabaseAdmin as any).from("league_members").upsert({
          league_id: league.id,
          user_id: context.userId,
        });
        return { league: league as { id: string; name: string; invite_code: string } };
      }
      if (!/duplicate|unique/i.test(error?.message ?? "")) {
        throw new Error(error?.message ?? "Could not create league");
      }
      code = inviteCode();
    }
    throw new Error("Could not allocate an invite code");
  });

export const joinLeagueByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ code: z.string().trim().min(4).max(16) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireApprovedMember(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.code.trim().toUpperCase();
    const { data: league, error } = await (supabaseAdmin as any)
      .from("leagues")
      .select("id, name, invite_code")
      .eq("invite_code", code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!league) throw new Error("No league found for that invite code.");
    await (supabaseAdmin as any).from("league_members").upsert({
      league_id: league.id,
      user_id: context.userId,
    });
    return { league: league as { id: string; name: string; invite_code: string } };
  });

function ensureStanding(map: Map<string, { points: number; bets: number; wins: number }>, id: string) {
  let row = map.get(id);
  if (!row) {
    row = { points: 0, bets: 0, wins: 0 };
    map.set(id, row);
  }
  return row;
}

function netPl(won: boolean, payout: number, stake: number) {
  return (won ? payout : 0) - stake;
}

export const getLeagueStandings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ leagueId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireApprovedMember(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: mine } = await (supabaseAdmin as any)
      .from("league_members")
      .select("league_id")
      .eq("league_id", data.leagueId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!mine) throw new Error("You are not in that league.");

    const { data: league, error: leagueErr } = await (supabaseAdmin as any)
      .from("leagues")
      .select("id, name, invite_code, created_at")
      .eq("id", data.leagueId)
      .single();
    if (leagueErr) throw new Error(leagueErr.message);

    const { data: members, error: memErr } = await (supabaseAdmin as any)
      .from("league_members")
      .select("user_id, joined_at")
      .eq("league_id", data.leagueId);
    if (memErr) throw new Error(memErr.message);

    const userIds = (members ?? []).map((m: any) => m.user_id as string);
    if (userIds.length === 0) {
      return {
        league: league as { id: string; name: string; invite_code: string; created_at: string },
        standings: [],
      };
    }

    const { data: profiles } = await (supabaseAdmin as any)
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);

    const [predsRes, sportsRes, f1Res, ufcRes] = await Promise.all([
      (supabaseAdmin as any)
        .from("predictions")
        .select("user_id, points, status")
        .in("user_id", userIds)
        .eq("is_simulation", false),
      (supabaseAdmin as any)
        .from("sports_bets")
        .select("user_id, stake, actual_payout, status")
        .in("user_id", userIds)
        .in("status", ["won", "lost"]),
      (supabaseAdmin as any)
        .from("f1_bets")
        .select("user_id, stake, potential_payout, status")
        .in("user_id", userIds)
        .in("status", ["won", "lost"]),
      (supabaseAdmin as any)
        .from("ufc_bets")
        .select("user_id, stake, potential_payout, payout, status")
        .in("user_id", userIds)
        .in("status", ["won", "lost"]),
    ]);

    const points = new Map<string, { points: number; bets: number; wins: number }>();
    for (const id of userIds) points.set(id, { points: 0, bets: 0, wins: 0 });

    for (const p of predsRes.data ?? []) {
      const row = ensureStanding(points, p.user_id as string);
      row.bets += 1;
      row.points += Number(p.points ?? 0);
      if (p.status === "won") row.wins += 1;
    }
    for (const b of sportsRes.data ?? []) {
      const row = ensureStanding(points, b.user_id as string);
      const stake = Number(b.stake ?? 0);
      const payout = Number(b.actual_payout ?? 0);
      const won = b.status === "won";
      row.bets += 1;
      row.points += netPl(won, payout, stake);
      if (won) row.wins += 1;
    }
    for (const b of f1Res.data ?? []) {
      const row = ensureStanding(points, b.user_id as string);
      const stake = Number(b.stake ?? 0);
      const payout = Number(b.potential_payout ?? 0);
      const won = b.status === "won";
      row.bets += 1;
      row.points += netPl(won, payout, stake);
      if (won) row.wins += 1;
    }
    for (const b of ufcRes.data ?? []) {
      const row = ensureStanding(points, b.user_id as string);
      const stake = Number(b.stake ?? 0);
      const payout = Number(b.payout ?? b.potential_payout ?? 0);
      const won = b.status === "won";
      row.bets += 1;
      row.points += netPl(won, payout, stake);
      if (won) row.wins += 1;
    }

    const nameById = new Map<string, string>(
      (profiles ?? []).map((p: any) => [p.id as string, (p.display_name as string) ?? "Member"]),
    );
    const standings = userIds
      .map((id: string) => ({
        userId: id,
        displayName: nameById.get(id) ?? "Member",
        ...(points.get(id) ?? { points: 0, bets: 0, wins: 0 }),
        isYou: id === context.userId,
      }))
      .sort(
        (a: { points: number; wins: number }, b: { points: number; wins: number }) =>
          b.points - a.points || b.wins - a.wins,
      );

    return {
      league: league as { id: string; name: string; invite_code: string; created_at: string },
      standings,
    };
  });

export const getLeagueActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ leagueId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireApprovedMember(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: mine } = await (supabaseAdmin as any)
      .from("league_members")
      .select("league_id")
      .eq("league_id", data.leagueId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!mine) throw new Error("You are not in that league.");

    const { data: members, error: memErr } = await (supabaseAdmin as any)
      .from("league_members")
      .select("user_id")
      .eq("league_id", data.leagueId);
    if (memErr) throw new Error(memErr.message);

    const userIds = (members ?? []).map((m: any) => m.user_id as string);
    if (userIds.length === 0) return { activity: [] as const };

    const { data: profiles } = await (supabaseAdmin as any)
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    const nameById = new Map<string, string>(
      (profiles ?? []).map((p: any) => [p.id as string, (p.display_name as string) ?? "Member"]),
    );

    const [predsRes, sportsRes, f1Res, ufcRes] = await Promise.all([
      (supabaseAdmin as any)
        .from("predictions")
        .select("user_id, points, status, settled_at, created_at")
        .in("user_id", userIds)
        .eq("is_simulation", false)
        .in("status", ["won", "lost"])
        .order("settled_at", { ascending: false })
        .limit(40),
      (supabaseAdmin as any)
        .from("sports_bets")
        .select("user_id, stake, actual_payout, status, settled_at")
        .in("user_id", userIds)
        .in("status", ["won", "lost"])
        .order("settled_at", { ascending: false })
        .limit(40),
      (supabaseAdmin as any)
        .from("f1_bets")
        .select("user_id, stake, potential_payout, status, settled_at")
        .in("user_id", userIds)
        .in("status", ["won", "lost"])
        .order("settled_at", { ascending: false })
        .limit(40),
      (supabaseAdmin as any)
        .from("ufc_bets")
        .select("user_id, stake, potential_payout, payout, status, settled_at")
        .in("user_id", userIds)
        .in("status", ["won", "lost"])
        .order("settled_at", { ascending: false })
        .limit(40),
    ]);

    type ActivityRow = {
      displayName: string;
      sport: string;
      result: "won" | "lost";
      pointsDelta: number;
      settledAt: string;
    };

    const activity: ActivityRow[] = [];

    for (const p of predsRes.data ?? []) {
      const result = p.status === "won" ? "won" : "lost";
      activity.push({
        displayName: nameById.get(p.user_id as string) ?? "Member",
        sport: "World Cup",
        result,
        pointsDelta: Number(p.points ?? 0),
        settledAt: (p.settled_at ?? p.created_at) as string,
      });
    }
    for (const b of sportsRes.data ?? []) {
      const won = b.status === "won";
      activity.push({
        displayName: nameById.get(b.user_id as string) ?? "Member",
        sport: "Football",
        result: won ? "won" : "lost",
        pointsDelta: netPl(won, Number(b.actual_payout ?? 0), Number(b.stake ?? 0)),
        settledAt: b.settled_at as string,
      });
    }
    for (const b of f1Res.data ?? []) {
      const won = b.status === "won";
      activity.push({
        displayName: nameById.get(b.user_id as string) ?? "Member",
        sport: "F1",
        result: won ? "won" : "lost",
        pointsDelta: netPl(won, Number(b.potential_payout ?? 0), Number(b.stake ?? 0)),
        settledAt: b.settled_at as string,
      });
    }
    for (const b of ufcRes.data ?? []) {
      const won = b.status === "won";
      activity.push({
        displayName: nameById.get(b.user_id as string) ?? "Member",
        sport: "UFC",
        result: won ? "won" : "lost",
        pointsDelta: netPl(won, Number(b.payout ?? b.potential_payout ?? 0), Number(b.stake ?? 0)),
        settledAt: b.settled_at as string,
      });
    }

    activity.sort((a, b) => new Date(b.settledAt).getTime() - new Date(a.settledAt).getTime());
    return { activity: activity.slice(0, 20) };
  });
