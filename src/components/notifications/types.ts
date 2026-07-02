export type NotifKind =
  | "bet_placed"
  | "bet_won"
  | "bet_lost"
  | "bet_void"
  | "payout_submitted"
  | "payout_approved"
  | "payout_rejected"
  | "payout_completed"
  | "deposit_submitted"
  | "deposit_approved"
  | "deposit_rejected"
  | "system";

export type NotifCategory = "all" | "bets" | "payouts" | "wins" | "system";

export type Notif = {
  id: string;                    // stable across refetches (source table + row id + event)
  kind: NotifKind;
  category: Exclude<NotifCategory, "all">;
  title: string;
  subtitle: string;
  timestamp: string;             // ISO
  href?: string;                 // where to route on tap
  amount?: number;               // signed
  status?: "approved" | "rejected" | "pending" | "won" | "lost" | "void" | "completed";
  meta?: Record<string, any>;
};
