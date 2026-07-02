import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { PageShell } from "@/components/ui/page-shell";
import { useNotifications, getLastReadAt, markAllRead } from "@/components/notifications/useNotifications";
import type { Notif, NotifCategory } from "@/components/notifications/types";
import {
  Coins,
  Ticket,
  Trophy,
  XCircle,
  CheckCircle2,
  Clock,
  ArrowDownToLine,
  ShieldAlert,
  Loader2,
  Bell,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — CSSEBets" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    win: typeof s.win === "string" ? s.win : undefined,
  }),
  component: NotificationsPage,
});

const TABS: { key: NotifCategory; label: string }[] = [
  { key: "all", label: "All" },
  { key: "bets", label: "Bets" },
  { key: "wins", label: "Wins" },
  { key: "payouts", label: "Payouts" },
  { key: "system", label: "System" },
];

function NotificationsPage() {
  const { data, isLoading } = useNotifications();
  const [tab, setTab] = useState<NotifCategory>("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<string | null>(getLastReadAt());

  useEffect(() => {
    const h = () => setLastReadAt(getLastReadAt());
    window.addEventListener("notif:read", h);
    return () => window.removeEventListener("notif:read", h);
  }, []);

  const notifs = data ?? [];
  const unreadCount = useMemo(
    () => notifs.filter((n) => !lastReadAt || n.timestamp > lastReadAt).length,
    [notifs, lastReadAt],
  );

  const filtered = useMemo(() => {
    let out = notifs;
    if (tab !== "all") out = out.filter((n) => n.category === tab);
    if (showUnreadOnly) out = out.filter((n) => !lastReadAt || n.timestamp > lastReadAt);
    return out;
  }, [notifs, tab, showUnreadOnly, lastReadAt]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <PageShell
      kicker="Inbox"
      title="Notifications"
      titleAccent={unreadCount > 0 ? `· ${unreadCount}` : undefined}
    >
      {/* Controls */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setShowUnreadOnly((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
            showUnreadOnly
              ? "border-[var(--neon)]/40 bg-[var(--neon)]/10 text-[var(--neon)]"
              : "border-white/10 bg-white/[0.02] text-[var(--ink-muted)] hover:text-[var(--ink)]"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${showUnreadOnly ? "bg-[var(--neon)]" : "bg-[var(--ink-muted)]"}`} />
          {showUnreadOnly ? "Unread only" : "All"}
        </button>
        <button
          onClick={markAllRead}
          disabled={unreadCount === 0}
          className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)] disabled:opacity-40"
        >
          Mark all read
        </button>
      </div>

      {/* Tabs */}
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center gap-1.5">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  active
                    ? "bg-[var(--ink)] text-[var(--surface)]"
                    : "bg-white/[0.03] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="pb-32">
        {isLoading ? (
          <div className="flex justify-center py-16 text-[var(--ink-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-6">
            {groups.map(([label, items]) => (
              <section key={label} className="space-y-1">
                <div className="px-1 pb-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--ink-muted)]">
                  {label}
                </div>
                <ul className="divide-y divide-white/[0.04]">
                  {items.map((n) => (
                    <li key={n.id}>
                      <NotifRow n={n} unread={!lastReadAt || n.timestamp > lastReadAt} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function NotifRow({ n, unread }: { n: Notif; unread: boolean }) {
  const body = (
    <div className="group flex items-start gap-3 py-3.5">
      <div className="relative mt-0.5">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.03] text-[var(--ink)]">
          <NotifIcon n={n} />
        </div>
        {unread && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--neon)] shadow-[0_0_8px_var(--neon)]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3
            className={`truncate text-[14px] leading-tight ${
              unread ? "font-semibold text-[var(--ink)]" : "font-medium text-[var(--ink)]/85"
            }`}
          >
            {n.title}
          </h3>
          <time className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            {relTime(n.timestamp)}
          </time>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-[var(--ink-muted)]">
          {n.subtitle}
        </p>
        {n.status && n.kind !== "bet_placed" && (
          <div className="mt-1.5">
            <StatusPill status={n.status} />
          </div>
        )}
      </div>
    </div>
  );
  if (n.href) {
    // Route href may include query (?win=…). Fall through to native Link when it's a plain path.
    if (n.href.startsWith("/notifications?win=")) {
      const id = n.href.split("=")[1];
      return (
        <Link to="/notifications" search={{ win: id } as any} className="block">
          {body}
        </Link>
      );
    }
    return (
      <Link to={n.href as any} className="block">
        {body}
      </Link>
    );
  }
  return body;
}

function NotifIcon({ n }: { n: Notif }) {
  const cls = "h-4 w-4";
  switch (n.kind) {
    case "bet_won":
      return <Trophy className={`${cls} text-[var(--neon)]`} />;
    case "bet_lost":
      return <XCircle className={`${cls} text-[var(--ink-muted)]`} />;
    case "bet_void":
      return <Clock className={`${cls} text-[var(--ink-muted)]`} />;
    case "bet_placed":
      return <Ticket className={`${cls} text-[var(--ink)]`} />;
    case "payout_approved":
    case "payout_completed":
      return <CheckCircle2 className={`${cls} text-[var(--neon)]`} />;
    case "payout_rejected":
    case "deposit_rejected":
      return <ShieldAlert className={`${cls} text-[color:oklch(0.75_0.19_25)]`} />;
    case "payout_submitted":
      return <Coins className={`${cls} text-[var(--ink)]`} />;
    case "deposit_submitted":
    case "deposit_approved":
      return <ArrowDownToLine className={`${cls} text-[var(--ink)]`} />;
    default:
      return <Bell className={cls} />;
  }
}

function StatusPill({ status }: { status: NonNullable<Notif["status"]> }) {
  const map: Record<string, { label: string; cls: string }> = {
    approved: { label: "Approved", cls: "bg-[var(--neon)]/10 text-[var(--neon)]" },
    completed: { label: "Completed", cls: "bg-[var(--neon)]/10 text-[var(--neon)]" },
    won: { label: "Won", cls: "bg-[var(--neon)]/10 text-[var(--neon)]" },
    pending: { label: "Pending", cls: "bg-white/[0.04] text-[var(--ink-muted)]" },
    rejected: { label: "Rejected", cls: "bg-[color:oklch(0.75_0.19_25/0.12)] text-[color:oklch(0.78_0.19_25)]" },
    lost: { label: "Lost", cls: "bg-white/[0.03] text-[var(--ink-muted)]" },
    void: { label: "Void", cls: "bg-white/[0.03] text-[var(--ink-muted)]" },
  };
  const cfg = map[status];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.18em] ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.03]">
        <Bell className="h-5 w-5 text-[var(--ink-muted)]" />
      </div>
      <div className="text-[15px] font-semibold text-[var(--ink)]">You&apos;re all caught up</div>
      <p className="mt-1 max-w-[260px] text-[12.5px] text-[var(--ink-muted)]">
        Bet placements, settlements, and payout updates will appear here.
      </p>
    </div>
  );
}

/* ---------- helpers ---------- */

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(1, Math.floor((now - then) / 1000));
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function groupByDate(items: Notif[]): [string, Notif[]][] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
  const groups: Record<string, Notif[]> = { Today: [], Yesterday: [], "This week": [], Earlier: [] };
  for (const n of items) {
    const d = new Date(n.timestamp);
    if (d >= today) groups.Today.push(n);
    else if (d >= yesterday) groups.Yesterday.push(n);
    else if (d >= weekAgo) groups["This week"].push(n);
    else groups.Earlier.push(n);
  }
  return (Object.entries(groups) as [string, Notif[]][]).filter(([, v]) => v.length > 0);
}
