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
    const { data: profiles } = await (supabaseAdmin as any)
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);

    const { data: preds } = await (supabaseAdmin as any)
      .from("predictions")
      .select("user_id, points, status")
      .in("user_id", userIds)
      .eq("is_simulation", false);

    const points = new Map<string, { points: number; bets: number; wins: number }>();
    for (const id of userIds) points.set(id, { points: 0, bets: 0, wins: 0 });
    for (const p of preds ?? []) {
      const row = points.get(p.user_id as string);
      if (!row) continue;
      row.bets += 1;
      row.points += Number(p.points ?? 0);
      if (p.status === "won") row.wins += 1;
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
