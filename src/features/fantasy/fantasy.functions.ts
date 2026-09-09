import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireApprovedMember } from "@/lib/access-control";
import { validateSquad, type FantasyPosition, type SquadPickInput } from "./scoring";

const COMPETITIONS = ["EPL", "LA_LIGA", "SERIE_A"];

export type FantasyPlayerRow = {
  id: string;
  name: string;
  photo: string | null;
  position: FantasyPosition;
  teamName: string;
  teamLogo: string | null;
  teamProviderId: number;
  competitionCode: string;
  price: number;
  totalPoints: number;
};

/** Selectable player pool for the three leagues. */
export const getFantasyPool = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("fantasy_players")
      .select(
        "id, name, photo, position, team_name, team_logo, team_provider_id, competition_code, price, total_points",
      )
      .eq("is_active", true)
      .in("competition_code", COMPETITIONS)
      .order("price", { ascending: false })
      .limit(1200);
    if (error) throw new Error(error.message);
    const players: FantasyPlayerRow[] = ((data ?? []) as any[]).map((p) => ({
      id: p.id,
      name: p.name,
      photo: p.photo,
      position: p.position,
      teamName: p.team_name,
      teamLogo: p.team_logo,
      teamProviderId: Number(p.team_provider_id),
      competitionCode: p.competition_code,
      price: Number(p.price),
      totalPoints: Number(p.total_points ?? 0),
    }));
    return { players };
  });

async function loadCurrentGameweek(supabaseAdmin: any) {
  const { data } = await supabaseAdmin
    .from("fantasy_gameweeks")
    .select("*")
    .neq("status", "settled")
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Lobby payload: this round, your squad, the round table and the season table. */
export const getFantasyOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const gw = await loadCurrentGameweek(supabaseAdmin);
    if (!gw) {
      return { gameweek: null, entry: null, leaderboard: [], season: [], entrants: 0 };
    }

    const [{ data: entry }, { data: entries }, { data: season }] = await Promise.all([
      (supabaseAdmin as any)
        .from("fantasy_entries")
        .select(
          "id, formation, budget_used, points, rank, prize, entry_fee, status, fantasy_entry_players(slot, role, price, points, fantasy_players(id, name, photo, position, team_name, team_logo, competition_code, price))",
        )
        .eq("gameweek_id", gw.id)
        .eq("user_id", context.userId)
        .maybeSingle(),
      (supabaseAdmin as any)
        .from("fantasy_entries")
        .select("id, user_id, points, rank, prize")
        .eq("gameweek_id", gw.id)
        .order("points", { ascending: false })
        .limit(25),
      (supabaseAdmin as any)
        .from("fantasy_season_standings")
        .select("user_id, points, entries, prize_total")
        .eq("season", gw.season)
        .order("points", { ascending: false })
        .limit(25),
    ]);

    const userIds = [
      ...new Set([
        ...((entries ?? []) as any[]).map((e) => e.user_id as string),
        ...((season ?? []) as any[]).map((s) => s.user_id as string),
      ]),
    ];
    const { data: profiles } = userIds.length
      ? await (supabaseAdmin as any).from("profiles").select("id, display_name").in("id", userIds)
      : { data: [] };
    const nameById = new Map<string, string>(
      ((profiles ?? []) as any[]).map((p) => [p.id as string, p.display_name ?? "Manager"]),
    );

    const { count: entrants } = await (supabaseAdmin as any)
      .from("fantasy_entries")
      .select("id", { count: "exact", head: true })
      .eq("gameweek_id", gw.id);

    return {
      gameweek: {
        id: gw.id as string,
        name: gw.name as string,
        season: gw.season as string,
        deadlineAt: gw.deadline_at as string,
        endsAt: gw.ends_at as string,
        entryFee: Number(gw.entry_fee),
        prizePool: Number(gw.prize_pool),
        status: gw.status as string,
        isOpen: new Date(gw.deadline_at).getTime() > Date.now() && gw.status !== "settled",
      },
      entrants: entrants ?? 0,
      entry: entry
        ? {
            id: entry.id as string,
            formation: entry.formation as string,
            budgetUsed: Number(entry.budget_used),
            points: Number(entry.points),
            rank: entry.rank as number | null,
            prize: Number(entry.prize),
            status: entry.status as string,
            picks: ((entry as any).fantasy_entry_players ?? [])
              .map((p: any) => ({
                slot: p.slot as number,
                role: p.role as "captain" | "vice" | null,
                price: Number(p.price),
                points: Number(p.points),
                player: {
                  id: p.fantasy_players?.id as string,
                  name: p.fantasy_players?.name as string,
                  photo: p.fantasy_players?.photo as string | null,
                  position: p.fantasy_players?.position as FantasyPosition,
                  teamName: p.fantasy_players?.team_name as string,
                  teamLogo: p.fantasy_players?.team_logo as string | null,
                  competitionCode: p.fantasy_players?.competition_code as string,
                },
              }))
              .sort((a: any, b: any) => a.slot - b.slot),
          }
        : null,
      leaderboard: ((entries ?? []) as any[]).map((e, i) => ({
        rank: e.rank ?? i + 1,
        displayName: nameById.get(e.user_id) ?? "Manager",
        points: Number(e.points),
        prize: Number(e.prize),
        isYou: e.user_id === context.userId,
      })),
      season: ((season ?? []) as any[]).map((s, i) => ({
        rank: i + 1,
        displayName: nameById.get(s.user_id) ?? "Manager",
        points: Number(s.points),
        entries: Number(s.entries),
        prizeTotal: Number(s.prize_total),
        isYou: s.user_id === context.userId,
      })),
    };
  });

const submitSchema = z.object({
  formation: z.string().min(3).max(8),
  captainId: z.string().uuid(),
  viceId: z.string().uuid(),
  playerIds: z.array(z.string().uuid()).length(11),
});

/** Enter (or re-pick before the deadline) a squad for the open round. */
export const submitFantasyEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => submitSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireApprovedMember(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { rpcWalletApplyChange } = await import("@/lib/supabase-rpc.server");

    const gw = await loadCurrentGameweek(supabaseAdmin);
    if (!gw) throw new Error("No fantasy round is open right now.");
    if (new Date(gw.deadline_at).getTime() <= Date.now()) {
      throw new Error("The deadline for this round has passed.");
    }

    const { data: rows, error: poolErr } = await (supabaseAdmin as any)
      .from("fantasy_players")
      .select("id, position, price, team_provider_id")
      .in("id", data.playerIds);
    if (poolErr) throw new Error(poolErr.message);
    if ((rows ?? []).length !== 11) throw new Error("One of your picks is no longer available.");

    const picks: SquadPickInput[] = ((rows ?? []) as any[]).map((p) => ({
      playerId: p.id,
      position: p.position,
      price: Number(p.price),
      teamProviderId: Number(p.team_provider_id),
    }));
    const check = validateSquad(picks, data.formation, data.captainId, data.viceId);
    if (!check.ok) throw new Error(check.reason);

    const { data: existing } = await (supabaseAdmin as any)
      .from("fantasy_entries")
      .select("id, entry_fee")
      .eq("gameweek_id", gw.id)
      .eq("user_id", context.userId)
      .maybeSingle();

    let entryId: string;
    if (existing) {
      entryId = existing.id;
      await (supabaseAdmin as any)
        .from("fantasy_entries")
        .update({ formation: data.formation, budget_used: check.spend })
        .eq("id", entryId);
      await (supabaseAdmin as any).from("fantasy_entry_players").delete().eq("entry_id", entryId);
    } else {
      const fee = Number(gw.entry_fee ?? 0);
      const { data: created, error: insErr } = await (supabaseAdmin as any)
        .from("fantasy_entries")
        .insert({
          gameweek_id: gw.id,
          user_id: context.userId,
          formation: data.formation,
          budget_used: check.spend,
          entry_fee: fee,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      entryId = created.id;

      if (fee > 0) {
        const { error: walletErr } = await rpcWalletApplyChange({
          p_user_id: context.userId,
          p_type: "debit",
          p_amount: fee,
          p_reference_type: "fantasy_entry" as any,
          p_reference_id: entryId,
          p_note: `Fantasy XI ${gw.name} entry`,
        } as any);
        if (walletErr) {
          await (supabaseAdmin as any).from("fantasy_entries").delete().eq("id", entryId);
          throw new Error(
            /INSUFFICIENT_BALANCE/i.test(walletErr.message)
              ? "You don't have enough points for the entry fee."
              : walletErr.message,
          );
        }
      }

      const { count } = await (supabaseAdmin as any)
        .from("fantasy_entries")
        .select("id", { count: "exact", head: true })
        .eq("gameweek_id", gw.id);
      await (supabaseAdmin as any)
        .from("fantasy_gameweeks")
        .update({ prize_pool: Number(gw.entry_fee ?? 0) * (count ?? 1) })
        .eq("id", gw.id);
    }

    const pickRows = data.playerIds.map((id, idx) => {
      const p = picks.find((x) => x.playerId === id)!;
      return {
        entry_id: entryId,
        player_id: id,
        slot: idx + 1,
        role: id === data.captainId ? "captain" : id === data.viceId ? "vice" : null,
        price: p.price,
      };
    });
    const { error: pickErr } = await (supabaseAdmin as any)
      .from("fantasy_entry_players")
      .insert(pickRows);
    if (pickErr) throw new Error(pickErr.message);

    return { entryId, spend: check.spend };
  });
