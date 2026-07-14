import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Notif } from "./types";

const LAST_READ_KEY = "notif:lastReadAt";

export function getLastReadAt(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_READ_KEY);
}

export function markAllRead() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_READ_KEY, new Date().toISOString());
  window.dispatchEvent(new Event("notif:read"));
}

function marketLabel(p: any): string {
  return p.selection_label || p.market_label || `${p.market} · ${p.outcome}`;
}

function matchLabel(p: any): string {
  const m = p.matches;
  if (!m) return "Match";
  return `${m.home_team} vs ${m.away_team}`;
}

function buildFromPrediction(p: any): Notif[] {
  const out: Notif[] = [];
  const stake = Number(p.virtual_stake ?? 0);
  const odds = Number(p.reference_odds ?? 0);
  const label = marketLabel(p);
  // Placement
  out.push({
    id: `pred:${p.id}:placed`,
    kind: "bet_placed",
    category: "bets",
    title: "Prediction locked",
    subtitle: `${label} · ${odds.toFixed(2)}x · Stake ${stake.toLocaleString()} pts`,
    timestamp: p.created_at,
    href: "/my-predictions",
    amount: -stake,
    status: "pending",
    meta: { predictionId: p.id },
  });
  // Settlement
  if (p.status && p.status !== "pending" && p.settled_at) {
    if (p.status === "won") {
      const gross = Number(p.gross_payout ?? stake * odds);
      out.push({
        id: `pred:${p.id}:won`,
        kind: "bet_won",
        category: "wins",
        title: "You won",
        subtitle: `${matchLabel(p)} · Won ${Math.round(gross).toLocaleString()} pts`,
        timestamp: p.settled_at,
        href: `/notifications?win=${p.id}`,
        amount: gross,
        status: "won",
        meta: { predictionId: p.id },
      });
    } else if (p.status === "lost") {
      out.push({
        id: `pred:${p.id}:lost`,
        kind: "bet_lost",
        category: "bets",
        title: "Prediction settled",
        subtitle: `${label} · Lost · -${stake.toLocaleString()} pts`,
        timestamp: p.settled_at,
        href: "/my-predictions",
        amount: -stake,
        status: "lost",
        meta: { predictionId: p.id },
      });
    } else if (p.status === "void") {
      out.push({
        id: `pred:${p.id}:void`,
        kind: "bet_void",
        category: "bets",
        title: "Prediction voided",
        subtitle: `${label} · Stake refunded`,
        timestamp: p.settled_at,
        href: "/my-predictions",
        status: "void",
        meta: { predictionId: p.id },
      });
    }
  }
  return out;
}

function buildFromPayout(pr: any): Notif[] {
  const out: Notif[] = [];
  const amt = Number(pr.amount ?? 0);
  out.push({
    id: `payout:${pr.id}:submitted`,
    kind: "payout_submitted",
    category: "payouts",
    title: "Payout request received",
    subtitle: `Your request for RM ${amt.toLocaleString()} is under review.`,
    timestamp: pr.created_at,
    href: "/payout",
    amount: -amt,
    status: "pending",
  });
  if (pr.status === "approved" && pr.approved_at) {
    out.push({
      id: `payout:${pr.id}:approved`,
      kind: "payout_approved",
      category: "payouts",
      title: "Payout approved",
      subtitle: `RM ${amt.toLocaleString()} has been approved and is being processed.`,
      timestamp: pr.approved_at,
      href: "/payout",
      amount: amt,
      status: "approved",
    });
  }
  if (pr.status === "rejected" && pr.rejected_at) {
    out.push({
      id: `payout:${pr.id}:rejected`,
      kind: "payout_rejected",
      category: "payouts",
      title: "Payout rejected",
      subtitle: pr.rejection_reason
        ? `${pr.rejection_reason}`
        : `Your payout of RM ${amt.toLocaleString()} was not approved.`,
      timestamp: pr.rejected_at,
      href: "/payout",
      amount: amt,
      status: "rejected",
    });
  }
  if (pr.status === "completed" && pr.completed_at) {
    out.push({
      id: `payout:${pr.id}:completed`,
      kind: "payout_completed",
      category: "payouts",
      title: "Payout completed",
      subtitle: `RM ${amt.toLocaleString()} has been sent to your bank.`,
      timestamp: pr.completed_at,
      href: "/payout",
      amount: amt,
      status: "completed",
    });
  }
  return out;
}

function buildFromPointRequest(pr: any): Notif[] {
  const out: Notif[] = [];
  const amt = Number(pr.requested_amount ?? 0);
  out.push({
    id: `points:${pr.id}:submitted`,
    kind: "deposit_submitted",
    category: "payouts",
    title: "Top-up request received",
    subtitle: `Your request for ${amt.toLocaleString()} pts is under review.`,
    timestamp: pr.requested_at ?? pr.submitted_at ?? new Date().toISOString(),
    href: "/wallet",
    amount: amt,
    status: "pending",
  });
  if (pr.status === "approved" && pr.reviewed_at) {
    out.push({
      id: `points:${pr.id}:approved`,
      kind: "deposit_approved",
      category: "payouts",
      title: "Top-up approved",
      subtitle: `${amt.toLocaleString()} pts have been added to your balance.`,
      timestamp: pr.reviewed_at,
      href: "/wallet",
      amount: amt,
      status: "approved",
    });
  }
  if (pr.status === "rejected" && pr.reviewed_at) {
    out.push({
      id: `points:${pr.id}:rejected`,
      kind: "deposit_rejected",
      category: "payouts",
      title: "Top-up rejected",
      subtitle: pr.rejection_reason || "Your top-up request was not approved.",
      timestamp: pr.reviewed_at,
      href: "/wallet",
      amount: amt,
      status: "rejected",
    });
  }
  return out;
}

export function useNotifications() {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: ["notifications", uid],
    enabled: !!uid,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Notif[]> => {
      const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
      const [preds, payouts, pointReqs] = await Promise.all([
        supabase
          .from("predictions")
          .select("id, market, outcome, reference_odds, virtual_stake, potential_return, gross_payout, status, settled_at, created_at, selection_label, market_label, matches:match_id(home_team, away_team)")
          .eq("user_id", uid!)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(80),
        supabase
          .from("payout_requests")
          .select("id, amount, status, created_at, approved_at, rejected_at, completed_at, rejection_reason")
          .eq("user_id", uid!)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("point_requests")
          .select("id, requested_amount, status, requested_at, submitted_at, reviewed_at, rejection_reason")
          .eq("user_id", uid!)
          .gte("requested_at", since)
          .order("requested_at", { ascending: false })
          .limit(30),
      ]);

      const list: Notif[] = [];
      (preds.data ?? []).forEach((p: any) => list.push(...buildFromPrediction(p)));
      (payouts.data ?? []).forEach((p: any) => list.push(...buildFromPayout(p)));
      (pointReqs.data ?? []).forEach((p: any) => list.push(...buildFromPointRequest(p)));

      // PROMO: pinned synthetic win entry for a specific account so they
      // can reopen the celebratory ticket anytime from the notifications feed.
      if (
        uid === "79b6a2c9-8ed2-45ba-8ef6-c24620a0c410" ||
        uid === "ba37e352-b4bf-4fb1-a15c-11b11a3b4cb1"
      ) {
        list.push({
          id: "pred:promo-ticket-arg-0001:won",
          kind: "bet_won",
          category: "wins",
          title: "You won",
          subtitle: "Argentina vs Switzerland · Won 3,250 pts",
          timestamp: new Date().toISOString(),
          href: "/notifications?win=promo-ticket-arg-0001",
          amount: 3250,
          status: "won",
        });
      }

      list.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      return list;
    },
  });
}

/** Query the single most recent WON prediction with full detail for the win modal. */
export function useLatestWin() {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: ["latest-win", uid],
    enabled: !!uid,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data } = await supabase
        .from("predictions")
        .select("id, market, outcome, reference_odds, virtual_stake, gross_payout, net_profit, potential_return, status, settled_at, selection_label, market_label, matches:match_id(home_team, away_team, kickoff_at)")
        .eq("user_id", uid!)
        .eq("status", "won")
        .order("settled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any | null;
    },
  });
}
