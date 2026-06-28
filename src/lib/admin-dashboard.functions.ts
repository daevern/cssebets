import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_TIERS = ["admin", "super_admin", "viewer"] as const;
const WRITE_TIERS = ["admin", "super_admin"] as const;
const SUPER_TIERS = ["super_admin"] as const;
const REAUTH_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_RESET_BALANCE = 1000;
const ADMIN_PAGE_SIZE = 1000;

function chunkArray<T>(items: T[], size = ADMIN_PAGE_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function getRoles(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as string);
}

async function requireTier(supabase: any, userId: string, tiers: readonly string[]) {
  const roles = await getRoles(supabase, userId);
  if (!roles.some((r) => tiers.includes(r))) throw new Error("Forbidden");
  return roles;
}

async function requireFreshReauth(adminClient: any, userId: string) {
  const { data } = await adminClient
    .from("admin_reauth")
    .select("expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error("Re-authentication required. Confirm your password in Admin → Settings.");
  }
}

async function audit(adminClient: any, params: {
  userId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await adminClient.from("audit_log").insert({
    user_id: params.userId,
    action: params.action,
    entity: params.entity,
    entity_id: params.entityId ?? null,
    old_value: params.oldValue ?? null,
    new_value: params.newValue ?? null,
    reason: params.reason ?? null,
    metadata: params.metadata ?? {},
  });
}

// ============== READS ==============

export const getAdminMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, ADMIN_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      { count: totalUsers },
      { count: totalPredictions },
      { count: unsettled },
      { count: voided },
      { data: preds },
      { data: txns },
      { data: profiles },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("predictions").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("predictions").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("predictions").select("id", { count: "exact", head: true }).eq("status", "void"),
      supabaseAdmin.from("predictions").select("user_id, virtual_stake, points, status"),
      supabaseAdmin.from("wallet_transactions").select("type, amount, created_at"),
      supabaseAdmin.from("profiles").select("id, display_name"),
    ]);

    const sinceActive = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: activeRows } = await supabaseAdmin
      .from("predictions").select("user_id").gte("created_at", sinceActive);
    const activeUsers = new Set((activeRows ?? []).map((r: any) => r.user_id)).size;

    const totalStake = (preds ?? []).reduce((s: number, p: any) => s + Number(p.virtual_stake || 0), 0);
    const totalPayouts = (txns ?? [])
      .filter((t: any) => t.type === "credit" && t.amount > 0)
      .reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalDebits = (txns ?? [])
      .filter((t: any) => t.type === "debit")
      .reduce((s: number, t: any) => s + Number(t.amount), 0);
    const netMovement = totalPayouts - totalDebits;

    // Aggregate per user points
    const pmap = new Map<string, number>();
    for (const p of preds ?? []) {
      pmap.set(p.user_id, (pmap.get(p.user_id) ?? 0) + Number(p.points || 0));
    }
    const nameOf = (id: string) =>
      profiles?.find((x: any) => x.id === id)?.display_name ?? id.slice(0, 8);
    const sortedUsers = [...pmap.entries()].sort((a, b) => b[1] - a[1]);
    const topWinners = sortedUsers.slice(0, 5).map(([id, pts]) => ({ id, name: nameOf(id), points: pts }));
    const topLosers = [...sortedUsers].reverse().slice(0, 5)
      .map(([id, pts]) => ({ id, name: nameOf(id), points: pts }));

    return {
      totalUsers: totalUsers ?? 0,
      activeUsers,
      totalPredictions: totalPredictions ?? 0,
      totalStake,
      totalPayouts,
      netMovement,
      unsettled: unsettled ?? 0,
      voided: voided ?? 0,
      topWinners,
      topLosers,
    };
  });

export const getMatchExposure = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, ADMIN_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: matches } = await supabaseAdmin
      .from("matches")
      .select("id, home_team, away_team, kickoff_at, status")
      .order("kickoff_at", { ascending: false })
      .limit(40);
    const ids = (matches ?? []).map((m: any) => m.id);
    if (!ids.length) return { rows: [] };
    const { data: preds } = await supabaseAdmin
      .from("predictions")
      .select("match_id, market, virtual_stake, status")
      .in("match_id", ids);
    const rows = (matches ?? []).map((m: any) => {
      const mp = (preds ?? []).filter((p: any) => p.match_id === m.id);
      const stake = mp.reduce((s: number, p: any) => s + Number(p.virtual_stake || 0), 0);
      return {
        id: m.id,
        match: `${m.home_team} vs ${m.away_team}`,
        kickoff_at: m.kickoff_at,
        status: m.status,
        count: mp.length,
        stake,
      };
    });
    return { rows };
  });

export const listMatchesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, ADMIN_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows: any[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabaseAdmin
        .from("matches")
        .select("id, external_id, home_team, away_team, kickoff_at, status, home_score, away_score, home_score_ht, away_score_ht, stage, group_name, reference_odds, odds_updated_at, odds_source, is_simulation, margin_disabled, winner, created_at, updated_at")
        .order("kickoff_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return { rows: rows as any[] };
  });

export const listUsersAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ search: z.string().trim().max(80).optional().default("") }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, ADMIN_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const profiles: any[] = [];
    {
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        let q = supabaseAdmin
          .from("profiles")
          .select("id, display_name, suspended, created_at")
          .order("display_name", { ascending: true })
          .range(from, from + PAGE - 1);
        if (data.search) q = q.ilike("display_name", `%${data.search}%`);
        const { data: page, error } = await q;
        if (error) throw new Error(error.message);
        if (!page || page.length === 0) break;
        profiles.push(...page);
        if (page.length < PAGE) break;
      }
    }

    const ids = (profiles ?? []).map((p: any) => p.id);
    const [{ data: wallets }, { data: roleRows }, { data: predCounts }] = await Promise.all([
      supabaseAdmin.from("wallets").select("user_id, balance").in("user_id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("predictions").select("user_id").in("user_id", ids),
    ]);
    const wmap = new Map((wallets ?? []).map((w: any) => [w.user_id, Number(w.balance)]));
    const rmap = new Map<string, string[]>();
    for (const r of roleRows ?? []) {
      const arr = rmap.get(r.user_id) ?? [];
      arr.push(r.role);
      rmap.set(r.user_id, arr);
    }
    const pcount = new Map<string, number>();
    for (const p of predCounts ?? []) pcount.set(p.user_id, (pcount.get(p.user_id) ?? 0) + 1);

    // Exclude staff (anyone holding a staff role) — they live in the Staff table.
    const STAFF = new Set(["admin", "super_admin", "customer_support", "viewer"]);
    const isStaff = (id: string) => (rmap.get(id) ?? []).some((r) => STAFF.has(r));

    return {
      users: (profiles ?? []).filter((p: any) => !isStaff(p.id)).map((p: any) => ({
        id: p.id,
        display_name: p.display_name,
        suspended: !!p.suspended,
        created_at: p.created_at,
        balance: wmap.get(p.id) ?? 0,
        roles: rmap.get(p.id) ?? [],
        predictions: pcount.get(p.id) ?? 0,
      })),
    };
  });

export const listStaffAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ search: z.string().trim().max(80).optional().default("") }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, ADMIN_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const STAFF_ROLES = ["admin", "super_admin", "customer_support", "viewer"] as const;
    const { data: roleRows, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", STAFF_ROLES as any);
    if (rErr) throw new Error(rErr.message);
    const rmap = new Map<string, string[]>();
    for (const r of roleRows ?? []) {
      const arr = rmap.get(r.user_id) ?? [];
      arr.push(r.role);
      rmap.set(r.user_id, arr);
    }
    const ids = Array.from(rmap.keys());
    if (!ids.length) return { staff: [] };

    let q = supabaseAdmin
      .from("profiles")
      .select("id, display_name, suspended, created_at")
      .in("id", ids)
      .order("display_name", { ascending: true });
    if (data.search) q = q.ilike("display_name", `%${data.search}%`);
    const { data: profiles, error } = await q;
    if (error) throw new Error(error.message);

    return {
      staff: (profiles ?? []).map((p: any) => ({
        id: p.id,
        display_name: p.display_name,
        suspended: !!p.suspended,
        created_at: p.created_at,
        roles: rmap.get(p.id) ?? [],
      })),
    };
  });

export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      targetUserId: z.string().uuid(),
      reason: z.string().trim().min(3).max(500),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, SUPER_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireFreshReauth(supabaseAdmin, userId);

    if (data.targetUserId === userId) {
      throw new Error("You can't delete your own account.");
    }

    // Capture for audit before deletion
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("display_name").eq("id", data.targetUserId).maybeSingle();

    // Remove role rows and the auth user (cascades to profile via FK).
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.targetUserId);
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(data.targetUserId);
    if (delErr) throw new Error(delErr.message);
    // Safety net if no auth row existed.
    await supabaseAdmin.from("profiles").delete().eq("id", data.targetUserId);

    await audit(supabaseAdmin, {
      userId, action: "user.delete", entity: "user", entityId: data.targetUserId,
      oldValue: { display_name: profile?.display_name ?? null }, reason: data.reason,
    });
    return { ok: true };
  });


export const getUserDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, ADMIN_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const predictionRows: any[] = [];
    for (let from = 0; ; from += ADMIN_PAGE_SIZE) {
      const { data: page, error } = await supabaseAdmin.from("predictions")
        .select("id, match_id, market, outcome, virtual_stake, reference_odds, potential_return, points, status, created_at, settled_at")
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .range(from, from + ADMIN_PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      if (!page || page.length === 0) break;
      predictionRows.push(...page);
      if (page.length < ADMIN_PAGE_SIZE) break;
    }

    const [{ data: profile }, { data: wallet }, { data: roleRows }, authResult] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("*").eq("id", data.userId).maybeSingle(),
        supabaseAdmin.from("wallets").select("balance, updated_at").eq("user_id", data.userId).maybeSingle(),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId),
        supabaseAdmin.auth.admin.getUserById(data.userId).catch(() => ({ data: { user: null } })),
      ]);
    const authUser = authResult?.data?.user;
    return {
      profile,
      wallet: wallet ?? { balance: 0, updated_at: null },
      predictions: predictionRows,
      roles: (roleRows ?? []).map((r: any) => r.role),
      email: authUser?.email || null,
      phoneNumber: authUser?.phone || profile?.phone_number || null,
    };
  });

export const listPredictionsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      userId: z.string().uuid().optional(),
      matchId: z.string().uuid().optional(),
      market: z.string().max(40).optional(),
      status: z.string().max(20).optional(),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, ADMIN_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows: any[] = [];
    for (let from = 0; ; from += ADMIN_PAGE_SIZE) {
      let q = supabaseAdmin
        .from("predictions")
        .select("id, user_id, match_id, market, outcome, virtual_stake, reference_odds, potential_return, points, status, created_at, settled_at")
        .order("created_at", { ascending: false })
        .range(from, from + ADMIN_PAGE_SIZE - 1);
      if (data.userId) q = q.eq("user_id", data.userId);
      if (data.matchId) q = q.eq("match_id", data.matchId);
      if (data.market) q = q.eq("market", data.market as any);
      if (data.status) q = q.eq("status", data.status as any);
      const { data: page, error } = await q;
      if (error) throw new Error(error.message);
      if (!page || page.length === 0) break;
      rows.push(...page);
      if (page.length < ADMIN_PAGE_SIZE) break;
    }

    const uids = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)));
    const mids = Array.from(new Set(rows.map((r: any) => r.match_id).filter(Boolean)));
    const profiles: any[] = [];
    const matches: any[] = [];
    await Promise.all([
      ...chunkArray(uids).map(async (ids) => {
        if (!ids.length) return;
        const { data: page, error } = await supabaseAdmin.from("profiles").select("id, display_name").in("id", ids);
        if (error) throw new Error(error.message);
        profiles.push(...(page ?? []));
      }),
      ...chunkArray(mids).map(async (ids) => {
        if (!ids.length) return;
        const { data: page, error } = await supabaseAdmin.from("matches").select("id, home_team, away_team").in("id", ids);
        if (error) throw new Error(error.message);
        matches.push(...(page ?? []));
      }),
    ]);
    const profileById = new Map(profiles.map((p: any) => [p.id, p]));
    const matchById = new Map(matches.map((m: any) => [m.id, m]));
    return {
      total: rows.length,
      predictions: rows.map((r: any) => {
        const match = matchById.get(r.match_id);
        return ({
        ...r,
        display_name: profileById.get(r.user_id)?.display_name ?? r.user_id.slice(0, 8),
        match: match
          ? `${match.home_team} vs ${match.away_team}`
          : "—",
      }); }),
    };
  });

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      action: z.string().max(60).optional(),
      limit: z.number().int().min(1).max(500).default(200),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, ADMIN_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("audit_log")
      .select("*").order("created_at", { ascending: false }).limit(data.limit);
    if (data.action) q = q.ilike("action", `%${data.action}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id).filter(Boolean)));
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, display_name").in("id", ids)
      : { data: [] as any[] };
    return {
      entries: (rows ?? []).map((r: any) => ({
        ...r,
        admin_name: profiles?.find((p: any) => p.id === r.user_id)?.display_name ?? (r.user_id ? r.user_id.slice(0, 8) : "system"),
      })),
    };
  });

// ============== REAUTH ==============

export const getReauthStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, ADMIN_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("admin_reauth")
      .select("expires_at, two_factor_placeholder")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      expiresAt: data?.expires_at ?? null,
      active: !!data && new Date(data.expires_at).getTime() > Date.now(),
      twoFactorPlaceholder: !!data?.two_factor_placeholder,
    };
  });

export const issueReauth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ password: z.string().min(1).max(200) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await requireTier(supabase, userId, ADMIN_TIERS);
    const email = (claims as any)?.email;
    if (!email) throw new Error("No email on session");

    const { createClient } = await import("@supabase/supabase-js");
    const verifier = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await verifier.auth.signInWithPassword({ email, password: data.password });
    if (error) throw new Error("Password incorrect");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const expires = new Date(Date.now() + REAUTH_WINDOW_MS).toISOString();
    await supabaseAdmin
      .from("admin_reauth")
      .upsert({ user_id: userId, issued_at: new Date().toISOString(), expires_at: expires });
    await audit(supabaseAdmin, { userId, action: "admin.reauth", entity: "admin" });
    return { expiresAt: expires };
  });

export const setTwoFactorPlaceholder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ enabled: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, ADMIN_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("admin_reauth").select("user_id").eq("user_id", userId).maybeSingle();
    if (existing) {
      await supabaseAdmin
        .from("admin_reauth")
        .update({ two_factor_placeholder: data.enabled })
        .eq("user_id", userId);
    } else {
      await supabaseAdmin.from("admin_reauth").insert({
        user_id: userId,
        expires_at: new Date(Date.now() - 1000).toISOString(),
        two_factor_placeholder: data.enabled,
      });
    }
    return { ok: true };
  });

// ============== WRITES (sensitive) ==============

const ReasonField = z.string().trim().min(3, "Reason is required").max(500);

export const updateUserDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      targetUserId: z.string().uuid(),
      displayName: z.string().trim().min(1).max(60),
      reason: ReasonField,
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, WRITE_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireFreshReauth(supabaseAdmin, userId);
    const { data: old } = await supabaseAdmin.from("profiles").select("display_name").eq("id", data.targetUserId).single();
    const { error } = await supabaseAdmin.from("profiles").update({ display_name: data.displayName }).eq("id", data.targetUserId);
    if (error) throw new Error(error.message);
    await audit(supabaseAdmin, {
      userId, action: "user.rename", entity: "user", entityId: data.targetUserId,
      oldValue: { display_name: old?.display_name }, newValue: { display_name: data.displayName },
      reason: data.reason,
    });
    return { ok: true };
  });

export const setUserSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ targetUserId: z.string().uuid(), suspended: z.boolean(), reason: ReasonField }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.targetUserId === userId) throw new Error("You cannot suspend your own account.");
    await requireTier(supabase, userId, WRITE_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Block targeting other admins/super_admins (only super_admin may suspend admins)
    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", data.targetUserId);
    const targetRoleSet = new Set((targetRoles ?? []).map((r: any) => r.role as string));
    if (targetRoleSet.has("super_admin")) throw new Error("Cannot suspend a super admin.");
    if (targetRoleSet.has("admin")) {
      const myRoles = await getRoles(supabase, userId);
      if (!myRoles.includes("super_admin")) throw new Error("Only a super admin can suspend an admin.");
    }

    const { error } = await supabaseAdmin.from("profiles").update({ suspended: data.suspended }).eq("id", data.targetUserId);
    if (error) throw new Error(error.message);

    // Enforce at the auth layer so the user is signed out / cannot log back in.
    try {
      await (supabaseAdmin.auth as any).admin.updateUserById(data.targetUserId, {
        ban_duration: data.suspended ? "876000h" : "none",
      });
    } catch (e) {
      console.error("[setUserSuspended] auth ban update failed", e);
    }

    await audit(supabaseAdmin, {
      userId, action: data.suspended ? "user.suspend" : "user.unsuspend",
      entity: "user", entityId: data.targetUserId,
      newValue: { suspended: data.suspended }, reason: data.reason,
    });
    return { ok: true };
  });

export const resetUserBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      targetUserId: z.string().uuid(),
      target: z.number().min(0).max(1_000_000).default(DEFAULT_RESET_BALANCE),
      reason: ReasonField,
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, WRITE_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireFreshReauth(supabaseAdmin, userId);

    const { data: wallet } = await supabaseAdmin
      .from("wallets").select("balance").eq("user_id", data.targetUserId).maybeSingle();
    const current = Number(wallet?.balance ?? 0);
    const delta = data.target - current;
    if (delta !== 0) {
      const { error } = await supabaseAdmin.rpc("wallet_apply_change", {
        p_user_id: data.targetUserId,
        p_type: delta > 0 ? "credit" : "debit",
        p_amount: Math.abs(delta),
        p_reference_type: "admin_adjustment",
        p_reference_id: undefined as unknown as string,
        p_note: `Admin reset to ${data.target}`,
      });
      if (error) throw new Error(error.message);
    }
    await audit(supabaseAdmin, {
      userId, action: "wallet.reset", entity: "wallet", entityId: data.targetUserId,
      oldValue: { balance: current }, newValue: { balance: data.target }, reason: data.reason,
    });
    return { ok: true, newBalance: data.target };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      targetUserId: z.string().uuid(),
      role: z.enum(["admin", "super_admin", "viewer", "member", "pending", "customer_support"]),
      add: z.boolean(),
      reason: ReasonField,
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, SUPER_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireFreshReauth(supabaseAdmin, userId);

    if (data.add) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.targetUserId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      // Prevent removing your own super_admin
      if (data.targetUserId === userId && data.role === "super_admin") {
        throw new Error("You can't remove your own super_admin role.");
      }
      const { error } = await supabaseAdmin
        .from("user_roles").delete().eq("user_id", data.targetUserId).eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    await audit(supabaseAdmin, {
      userId, action: data.add ? "role.add" : "role.remove",
      entity: "user", entityId: data.targetUserId,
      newValue: { role: data.role }, reason: data.reason,
    });
    return { ok: true };
  });

export const voidPredictionAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ predictionId: z.string().uuid(), reason: ReasonField }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, WRITE_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireFreshReauth(supabaseAdmin, userId);

    const { data: p } = await supabaseAdmin.from("predictions").select("*").eq("id", data.predictionId).single();
    if (!p) throw new Error("Prediction not found");
    if (p.status !== "pending") throw new Error(`Cannot void a ${p.status} prediction`);

    await supabaseAdmin.from("predictions").update({
      status: "void", points: 0, settled_at: new Date().toISOString(),
    }).eq("id", p.id);

    await supabaseAdmin.rpc("wallet_apply_change", {
      p_user_id: p.user_id, p_type: "refund", p_amount: Number(p.virtual_stake),
      p_reference_type: "bet_settlement", p_reference_id: p.id,
      p_note: `Void refund: ${data.reason}`,
    });

    await audit(supabaseAdmin, {
      userId, action: "prediction.void", entity: "prediction", entityId: p.id,
      oldValue: { status: p.status }, newValue: { status: "void" }, reason: data.reason,
    });
    return { ok: true };
  });

export const setMatchStatusManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      matchId: z.string().uuid(),
      status: z.enum(["scheduled", "live", "finished", "cancelled", "postponed"]),
      reason: ReasonField,
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, WRITE_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireFreshReauth(supabaseAdmin, userId);
    const { data: old } = await supabaseAdmin.from("matches").select("status").eq("id", data.matchId).single();
    const { error } = await supabaseAdmin.from("matches").update({
      status: data.status, updated_at: new Date().toISOString(),
    }).eq("id", data.matchId);
    if (error) throw new Error(error.message);
    await audit(supabaseAdmin, {
      userId, action: "match.status", entity: "match", entityId: data.matchId,
      oldValue: { status: old?.status }, newValue: { status: data.status }, reason: data.reason,
    });
    return { ok: true };
  });

export const refreshMatchScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ matchId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, WRITE_TIERS);
    const { runFootballDataSync } = await import("@/lib/sync.server");
    const result = await runFootballDataSync({ userId });
    return { ok: true, ...result, matchId: data.matchId };
  });

export const setMatchMarginDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      matchId: z.string().uuid(),
      disabled: z.boolean(),
      reason: ReasonField,
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, WRITE_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireFreshReauth(supabaseAdmin, userId);
    const { data: old } = await supabaseAdmin
      .from("matches")
      .select("margin_disabled")
      .eq("id", data.matchId)
      .single();
    const { error: rpcErr } = await (supabaseAdmin as any).rpc(
      "admin_set_match_margin_disabled",
      { p_match_id: data.matchId, p_disabled: data.disabled },
    );
    if (rpcErr) throw new Error(rpcErr.message);
    await audit(supabaseAdmin, {
      userId,
      action: "match.margin_disabled",
      entity: "match",
      entityId: data.matchId,
      oldValue: { margin_disabled: (old as any)?.margin_disabled ?? false },
      newValue: { margin_disabled: data.disabled },
      reason: data.reason,
    });
    return { ok: true };
  });



// ============== WALLET LEDGER (admin) ==============

export const listWalletLedgerAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      userId: z.string().uuid().optional(),
      type: z.string().max(40).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      limit: z.number().int().min(1).max(1000).default(300),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, ADMIN_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("wallet_transactions")
      .select("id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, note, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.userId) q = q.eq("user_id", data.userId);
    if (data.type) q = q.eq("type", data.type as any);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const uids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    const { data: profiles } = uids.length
      ? await supabaseAdmin.from("profiles").select("id, display_name").in("id", uids)
      : { data: [] as any[] };
    return {
      transactions: (rows ?? []).map((r: any) => ({
        ...r,
        display_name: profiles?.find((p: any) => p.id === r.user_id)?.display_name ?? r.user_id.slice(0, 8),
      })),
    };
  });

// ============== ODDS SNAPSHOTS (admin) ==============

export const listMatchOddsHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ matchId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, ADMIN_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("match_odds_snapshots")
      .select("id, source, home_odds, draw_odds, away_odds, raw_bookmaker_count, sampled_at")
      .eq("match_id", data.matchId)
      .order("sampled_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { snapshots: rows ?? [] };
  });

export const listMatchesForOdds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, ADMIN_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("matches")
      .select("id, home_team, away_team, kickoff_at, status, reference_odds, odds_updated_at")
      .order("kickoff_at", { ascending: false })
      .limit(80);
    if (error) throw new Error(error.message);
    return { matches: data ?? [] };
  });

// ============== PRICING BREAKDOWN (admin diagnostics, read-only) ==============
// Shows how API odds become CSSEBets odds. Does NOT mutate odds, pricing, or markets.

export const getMatchPricingBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ matchId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, ADMIN_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { compute3WayOdds, getRealOddsMarginSettings } = await import("@/lib/odds-margin.server");

    const [matchRes, mktRes, alertsRes, settingsRes] = await Promise.all([
      supabaseAdmin
        .from("matches")
        .select(
          "id, home_team, away_team, kickoff_at, status, reference_odds, odds_updated_at, odds_source, odds_status, suspended_markets, manual_override, is_simulation, home_liability, draw_liability, away_liability, worst_case_exposure",
        )
        .eq("id", data.matchId)
        .maybeSingle(),
      supabaseAdmin
        .from("match_market_odds")
        .select("market, selection, odds, source, generated, active, updated_at")
        .eq("match_id", data.matchId)
        .order("market", { ascending: true })
        .order("selection", { ascending: true }),
      supabaseAdmin
        .from("operational_alerts")
        .select("id, level, category, title, message, status, created_at, metadata")
        .or(`metadata->>match_id.eq.${data.matchId},metadata->>matchId.eq.${data.matchId}`)
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("platform_settings" as any)
        .select("margin_pct, apply_margin_to_real, max_single_bet_payout, max_match_worst_case_liability")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    if (matchRes.error) throw new Error(matchRes.error.message);
    const match: any = matchRes.data;
    if (!match) throw new Error("Match not found");

    const settings: any = settingsRes.data ?? {};
    const marginCfg = await getRealOddsMarginSettings();
    const MIN_ODD = 1.01;

    const ref = (match.reference_odds ?? {}) as { home?: number; draw?: number; away?: number };
    const has3Way = ref && Number(ref.home) > 1 && Number(ref.draw) > 1 && Number(ref.away) > 1;
    const threeWay = has3Way
      ? await compute3WayOdds({
          home: Number(ref.home),
          draw: Number(ref.draw),
          away: Number(ref.away),
        })
      : null;

    const rows = (mktRes.data ?? []) as any[];
    const byMarket = new Map<string, any[]>();
    for (const r of rows) {
      if (!byMarket.has(r.market)) byMarket.set(r.market, []);
      byMarket.get(r.market)!.push(r);
    }
    const margin = Number(marginCfg.marginPct) / 100;
    const markets = Array.from(byMarket.entries()).map(([market, items]) => {
      const withRaw = items.map((it: any) => {
        const odds = Number(it.odds);
        return {
          ...it,
          odds,
          rawImpliedProb: odds > 0 ? 1 / odds : 0,
          floorApplied: odds <= MIN_ODD + 1e-9,
        };
      });
      const rawSum = withRaw.reduce((s, r) => s + r.rawImpliedProb, 0);
      const overround = rawSum - 1;
      const enriched = withRaw.map((r) => {
        const housedProb = rawSum > 0 ? r.rawImpliedProb / rawSum : 0;
        const fairProb = marginCfg.apply && 1 + margin > 0 ? housedProb / (1 + margin) : housedProb;
        return {
          selection: r.selection,
          odds: r.odds,
          source: r.source,
          generated: r.generated,
          active: r.active,
          updated_at: r.updated_at,
          rawImpliedProb: r.rawImpliedProb,
          fairProb,
          housedProb,
          marginAppliedPct: marginCfg.apply ? marginCfg.marginPct : 0,
          floorApplied: r.floorApplied,
        };
      });
      let otherInfo: any = null;
      if (market === "correct_score") {
        const other = enriched.find((e) => e.selection === "OTHER");
        const listed = enriched.filter((e) => e.selection !== "OTHER");
        const listedFairSum = listed.reduce((s, e) => s + e.fairProb, 0);
        otherInfo = {
          residualFairProb: Math.max(0, 1 - listedFairSum),
          listedFairSum,
          storedOtherOdds: other?.odds ?? null,
          storedOtherProb: other?.rawImpliedProb ?? null,
        };
      }
      const isPoisson =
        market === "btts" ||
        market === "over_under_2_5" ||
        market === "exact_total_goals" ||
        market === "correct_score" ||
        market === "half_time_full_time";
      return {
        market,
        modelType: isPoisson ? "poisson_from_reference_odds" : "direct_3way",
        rawSum,
        overround,
        selections: enriched,
        otherInfo,
      };
    });

    const maxLiab = Number(settings.max_match_worst_case_liability ?? 0);
    const worstCase = Number(match.worst_case_exposure ?? 0);
    const highLiability = maxLiab > 0 && worstCase >= 0.9 * maxLiab;

    const warnings: Array<{ code: string; severity: "info" | "warn" | "error"; message: string }> = [];
    if (!has3Way) warnings.push({ code: "API_ODDS_MISSING", severity: "error", message: "No reference 1X2 odds stored for this match." });
    if (!match.odds_updated_at) warnings.push({ code: "ODDS_AWAITING_SYNC", severity: "warn", message: "Odds have never been synced from provider." });
    if (match.odds_status && !["fresh", "ok"].includes(String(match.odds_status))) {
      warnings.push({
        code: `ODDS_${String(match.odds_status).toUpperCase()}`,
        severity: match.odds_status === "stale" ? "warn" : "error",
        message: `Odds status: ${match.odds_status}`,
      });
    }
    if (Array.isArray(match.suspended_markets) && match.suspended_markets.length > 0) {
      warnings.push({ code: "MARKET_UNAVAILABLE", severity: "warn", message: `Suspended markets: ${match.suspended_markets.join(", ")}` });
    }
    if (markets.some((m) => m.selections.some((s: any) => s.floorApplied))) {
      warnings.push({ code: "ODDS_FLOOR_APPLIED", severity: "info", message: "Minimum 1.01 floor applied on one or more selections." });
    }
    if (highLiability) {
      warnings.push({ code: "HIGH_LIABILITY", severity: "warn", message: `Worst-case exposure ${worstCase.toFixed(2)} ≥ 90% of cap ${maxLiab.toFixed(2)}.` });
    }
    if (match.manual_override) {
      warnings.push({ code: "MANUAL_OVERRIDE", severity: "info", message: "Match odds are under manual admin override (odds cap/override applied)." });
    }
    if (match.is_simulation) {
      warnings.push({ code: "SIMULATION_MATCH", severity: "info", message: "Simulation match — synthetic odds are allowed." });
    }

    return {
      match: {
        id: match.id,
        home_team: match.home_team,
        away_team: match.away_team,
        kickoff_at: match.kickoff_at,
        status: match.status,
        odds_status: match.odds_status,
        odds_updated_at: match.odds_updated_at,
        odds_source: match.odds_source,
        manual_override: match.manual_override,
        is_simulation: match.is_simulation,
        suspended_markets: match.suspended_markets ?? [],
        reference_odds: match.reference_odds,
        liabilities: {
          home: Number(match.home_liability ?? 0),
          draw: Number(match.draw_liability ?? 0),
          away: Number(match.away_liability ?? 0),
          worst_case: worstCase,
          cap: maxLiab,
        },
      },
      pricingConfig: {
        marginPct: marginCfg.marginPct,
        applyMarginToReal: marginCfg.apply,
        minOdd: MIN_ODD,
        maxSingleBetPayout: Number(settings.max_single_bet_payout ?? 0),
        maxMatchWorstCaseLiability: maxLiab,
      },
      threeWay,
      markets,
      warnings,
      alerts: alertsRes.data ?? [],
    };
  });
