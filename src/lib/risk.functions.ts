import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_TIERS = ["admin", "super_admin", "viewer"] as const;

async function requireTier(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId) as { data: { role: string }[] | null };
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!roles.some((r) => ADMIN_TIERS.includes(r as any))) throw new Error("Forbidden");
}

export type OutcomeBucket = {
  key: string;
  market: string;
  outcome: string;
  stake: number;
  potentialPayout: number;
  liabilityIfWins: number;
  netIfWins: number;
  shareOfMatch: number;
  bets: number;
};

export type UserExposure = {
  userId: string;
  name: string;
  stake: number;
  potentialPayout: number;
  exposure: number;
};

export type MatchRisk = {
  matchId: string;
  match: string;
  kickoffAt: string | null;
  status: string;
  totalStake: number;
  totalPotentialPayout: number;
  worstCaseLiability: number;
  worstOutcomeKey: string | null;
  bets: number;
  outcomes: OutcomeBucket[];
  topUsers: UserExposure[];
  recommendation: "accept" | "limit_stake" | "reduce_odds" | "close_market";
  reasons: string[];
};

export type RiskAlert = {
  level: "warn" | "critical";
  type: "outcome_dominance" | "bankroll_breach" | "user_exposure" | "total_liability";
  message: string;
  matchId?: string;
  userId?: string;
};

export type RiskDashboard = {
  bankrollAvailable: boolean;
  error?: string;
  bankroll: number;
  bankrollBalance: number;
  bankrollAvailableAmount: number;
  bankrollShortfall: number;
  bankrollCoverageRatio: number | null;
  safetyRatio: number | null;
  exposureRatio: number | null;
  maxAcceptableLiability: number;
  totalStake: number;
  totalPotentialPayout: number;
  totalWorstCaseLiability: number;
  matches: MatchRisk[];
  alerts: RiskAlert[];
  bankrollUpdatedAt: string | null;
};

export const getRiskDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      userExposurePct: z.number().min(1).max(100).default(15),
      exposureCapPct: z.number().min(0.01).max(1).default(0.6),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // -----------------------------------------------------------------
    // Phase 6: canonical bankroll = platform_bankroll (singleton id = 1)
    // No caller-provided / hardcoded / platform_settings fallback.
    // -----------------------------------------------------------------
    const { data: bankrollRow, error: bankrollErr } = await (supabaseAdmin as any)
      .from("platform_bankroll")
      .select("balance, total_stakes_collected, total_payouts_paid, updated_at")
      .eq("id", 1)
      .maybeSingle();

    if (bankrollErr || !bankrollRow || bankrollRow.balance === null || bankrollRow.balance === undefined) {
      const empty: RiskDashboard = {
        bankrollAvailable: false,
        error: "Bankroll unavailable. Risk dashboard disabled until platform bankroll is configured.",
        bankroll: 0,
        bankrollBalance: 0,
        bankrollAvailableAmount: 0,
        bankrollShortfall: 0,
        bankrollCoverageRatio: null,
        safetyRatio: null,
        exposureRatio: null,
        maxAcceptableLiability: 0,
        totalStake: 0,
        totalPotentialPayout: 0,
        totalWorstCaseLiability: 0,
        matches: [],
        alerts: [{
          level: "critical",
          type: "bankroll_breach",
          message: "Platform bankroll row missing — risk calculations disabled.",
        }],
        bankrollUpdatedAt: null,
      };
      return empty;
    }

    const bankroll = Number(bankrollRow.balance);
    const bankrollUpdatedAt = bankrollRow.updated_at ?? null;

    const { data: preds } = await supabaseAdmin
      .from("predictions")
      .select("id, user_id, match_id, market, outcome, virtual_stake, potential_return, status")
      .eq("status", "pending")
      .eq("is_simulation" as any, false);

    const matchIds = Array.from(new Set((preds ?? []).map((p: any) => p.match_id).filter(Boolean)));
    const userIds = Array.from(new Set((preds ?? []).map((p: any) => p.user_id).filter(Boolean)));

    const [{ data: matches }, { data: profiles }] = await Promise.all([
      matchIds.length
        ? supabaseAdmin.from("matches").select("id, home_team, away_team, kickoff_at, status").in("id", matchIds)
        : Promise.resolve({ data: [] as any[] }),
      userIds.length
        ? supabaseAdmin.from("profiles").select("id, display_name").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const nameOf = (uid: string) =>
      profiles?.find((p: any) => p.id === uid)?.display_name ?? uid.slice(0, 8);

    const byMatch = new Map<string, any[]>();
    for (const p of preds ?? []) {
      if (!p.match_id) continue;
      const arr = byMatch.get(p.match_id) ?? [];
      arr.push(p);
      byMatch.set(p.match_id, arr);
    }

    const userExposureTotals = new Map<string, number>();
    const matchRows: MatchRisk[] = [];

    for (const m of matches ?? []) {
      const list = byMatch.get(m.id) ?? [];
      const totalStake = list.reduce((s, p) => s + Number(p.virtual_stake || 0), 0);

      const buckets = new Map<string, OutcomeBucket>();
      for (const p of list) {
        const key = `${p.market}|${p.outcome}`;
        const b = buckets.get(key) ?? {
          key, market: p.market, outcome: p.outcome,
          stake: 0, potentialPayout: 0, liabilityIfWins: 0, netIfWins: 0, shareOfMatch: 0, bets: 0,
        };
        b.stake += Number(p.virtual_stake || 0);
        b.potentialPayout += Number(p.potential_return || 0);
        b.bets += 1;
        buckets.set(key, b);
      }

      const outcomes = [...buckets.values()].map((b) => {
        b.liabilityIfWins = Math.max(0, b.potentialPayout - totalStake);
        b.netIfWins = totalStake - b.potentialPayout;
        b.shareOfMatch = totalStake > 0 ? b.stake / totalStake : 0;
        return b;
      }).sort((a, b) => b.liabilityIfWins - a.liabilityIfWins);

      const worst = outcomes[0];
      const worstCaseLiability = worst?.liabilityIfWins ?? 0;
      const totalPotentialPayout = outcomes.reduce((s, b) => s + b.potentialPayout, 0);

      const userBuckets = new Map<string, UserExposure>();
      for (const p of list) {
        const u = userBuckets.get(p.user_id) ?? {
          userId: p.user_id, name: nameOf(p.user_id), stake: 0, potentialPayout: 0, exposure: 0,
        };
        u.stake += Number(p.virtual_stake || 0);
        u.potentialPayout += Number(p.potential_return || 0);
        u.exposure = Math.max(0, u.potentialPayout - u.stake);
        userBuckets.set(p.user_id, u);
      }
      const topUsers = [...userBuckets.values()].sort((a, b) => b.exposure - a.exposure).slice(0, 5);

      for (const u of userBuckets.values()) {
        userExposureTotals.set(u.userId, (userExposureTotals.get(u.userId) ?? 0) + u.exposure);
      }

      const reasons: string[] = [];
      let recommendation: MatchRisk["recommendation"] = "accept";
      const maxShare = outcomes.reduce((m, b) => Math.max(m, b.shareOfMatch), 0);
      const liabilityPct = bankroll > 0 ? worstCaseLiability / bankroll : 0;

      if (liabilityPct > 0.30) {
        recommendation = "close_market";
        reasons.push(`Worst-case liability is ${(liabilityPct * 100).toFixed(0)}% of bankroll`);
      } else if (maxShare > 0.65) {
        recommendation = "reduce_odds";
        reasons.push(`${(maxShare * 100).toFixed(0)}% of stake on one outcome`);
      } else if (maxShare > 0.50 || liabilityPct > 0.15) {
        recommendation = "limit_stake";
        if (maxShare > 0.50) reasons.push(`${(maxShare * 100).toFixed(0)}% of stake on one outcome`);
        if (liabilityPct > 0.15) reasons.push(`Liability ${(liabilityPct * 100).toFixed(0)}% of bankroll`);
      } else {
        reasons.push("Exposure within safe range");
      }

      matchRows.push({
        matchId: m.id, match: `${m.home_team} vs ${m.away_team}`, kickoffAt: m.kickoff_at,
        status: m.status, totalStake, totalPotentialPayout, worstCaseLiability,
        worstOutcomeKey: worst?.key ?? null, bets: list.length, outcomes, topUsers,
        recommendation, reasons,
      });
    }

    matchRows.sort((a, b) => b.worstCaseLiability - a.worstCaseLiability);

    const totalStake = matchRows.reduce((s, m) => s + m.totalStake, 0);
    const totalPotentialPayout = matchRows.reduce((s, m) => s + m.totalPotentialPayout, 0);
    const totalWorstCaseLiability = matchRows.reduce((s, m) => s + m.worstCaseLiability, 0);

    // ---------- Real bankroll enforcement metrics ----------
    const maxAcceptableLiability = bankroll * data.exposureCapPct;
    const bankrollAvailableAmount = Math.max(0, bankroll - totalWorstCaseLiability);
    const bankrollShortfall = Math.max(0, totalWorstCaseLiability - bankroll);
    const bankrollCoverageRatio = totalWorstCaseLiability > 0 ? bankroll / totalWorstCaseLiability : null;
    const safetyRatio = bankrollCoverageRatio;
    const exposureRatio = bankroll > 0 ? totalWorstCaseLiability / bankroll : null;

    const alerts: RiskAlert[] = [];
    for (const m of matchRows) {
      for (const o of m.outcomes) {
        if (o.shareOfMatch > 0.5 && m.totalStake > 0) {
          alerts.push({
            level: o.shareOfMatch > 0.7 ? "critical" : "warn",
            type: "outcome_dominance",
            message: `${m.match}: ${(o.shareOfMatch * 100).toFixed(0)}% of stake on ${o.market}/${o.outcome}`,
            matchId: m.matchId,
          });
        }
      }
      if (m.worstCaseLiability > bankroll) {
        alerts.push({
          level: "critical",
          type: "bankroll_breach",
          message: `${m.match}: worst-case loss RM${m.worstCaseLiability.toFixed(0)} exceeds bankroll RM${bankroll.toFixed(0)}`,
          matchId: m.matchId,
        });
      }
    }

    const userThreshold = (data.userExposurePct / 100) * bankroll;
    for (const [uid, exp] of userExposureTotals.entries()) {
      if (exp > userThreshold && userThreshold > 0) {
        alerts.push({
          level: exp > userThreshold * 2 ? "critical" : "warn",
          type: "user_exposure",
          message: `User ${nameOf(uid)} has RM${exp.toFixed(0)} potential exposure (>${data.userExposurePct}% of bankroll)`,
          userId: uid,
        });
      }
    }

    if (totalWorstCaseLiability > bankroll) {
      alerts.unshift({
        level: "critical",
        type: "total_liability",
        message: `Total worst-case liability RM${totalWorstCaseLiability.toFixed(0)} exceeds bankroll RM${bankroll.toFixed(0)} (shortfall RM${bankrollShortfall.toFixed(0)})`,
      });
    } else if (totalWorstCaseLiability > maxAcceptableLiability) {
      alerts.unshift({
        level: "warn",
        type: "total_liability",
        message: `Total worst-case liability RM${totalWorstCaseLiability.toFixed(0)} exceeds acceptable cap RM${maxAcceptableLiability.toFixed(0)} (${(data.exposureCapPct * 100).toFixed(0)}% of bankroll)`,
      });
    }

    const result: RiskDashboard = {
      bankrollAvailable: true,
      bankroll,
      bankrollBalance: bankroll,
      bankrollAvailableAmount,
      bankrollShortfall,
      bankrollCoverageRatio,
      safetyRatio,
      exposureRatio,
      maxAcceptableLiability,
      totalStake,
      totalPotentialPayout,
      totalWorstCaseLiability,
      matches: matchRows,
      alerts,
      bankrollUpdatedAt,
    };
    return result;
  });
