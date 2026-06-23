import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Users,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
  Trophy,
  HandCoins,
  FileCheck,
} from "lucide-react";
import {
  getPublicRecentActivity,
  getPublicPayoutPerformance,
  getPublicCommunityGrowth,
} from "@/lib/trust-public.functions";

/* ---------- formatters ---------- */
function fmt(n: number | null | undefined) {
  if (n == null) return null;
  return Math.round(Number(n)).toLocaleString("en-US");
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.floor(diff / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/* ---------- shared bits ---------- */
function SectionHeader({
  kicker,
  title,
  subtitle,
}: {
  kicker?: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6 text-center">
      {kicker && (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
          {kicker}
        </div>
      )}
      <h2 className="mt-3 text-2xl font-black uppercase tracking-tight sm:text-3xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | null;
  sub?: string;
}) {
  return (
    <div className="border border-dashed border-primary/20 bg-card/60 px-3 py-3">
      <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-black leading-none tabular-nums text-foreground">
        {value ?? <span className="text-muted-foreground">—</span>}
      </div>
      {sub && (
        <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-primary/70">
          {sub}
        </div>
      )}
    </div>
  );
}

/* ---------- COMMUNITY GROWTH (this week) ---------- */
export function CommunityGrowthSection() {
  const fn = useServerFn(getPublicCommunityGrowth);
  const q = useQuery({
    queryKey: ["public", "growth"],
    queryFn: () => fn({}),
    staleTime: 45_000,
    refetchInterval: 60_000,
  });
  const d = q.data;
  const total =
    (d?.views_this_week ?? 0) +
    (d?.members_this_week ?? 0) +
    (d?.bets_this_week ?? 0) +
    (Number(d?.points_paid_out_this_week ?? 0));

  return (
    <section className="bg-gradient-to-b from-background to-card/30 py-12 sm:py-16">
      <div className="mx-auto max-w-5xl px-4">
        <SectionHeader
          kicker={<><Users className="h-3 w-3" /> This week</>}
          title="Community Growth"
          subtitle="All-time platform data displayed with this-week descriptions — updated automatically."
        />
        {q.isLoading && !d ? (
          <div className="rounded-md border border-dashed border-primary/20 bg-card/50 p-8 text-center text-sm text-muted-foreground">
            Loading community growth…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Views this week" value={fmt(d?.views_this_week ?? 0)} />
              <Stat label="Members this week" value={fmt(d?.members_this_week ?? 0)} />
              <Stat label="Bets this week" value={fmt(d?.bets_this_week ?? 0)} />
              <Stat label="Points paid out this week" value={fmt(Number(d?.points_paid_out_this_week ?? 0))} />
            </div>
            {total === 0 && (
              <p className="mt-4 text-center text-[11px] italic text-muted-foreground">
                Every community starts somewhere. Thank you for helping build CSSEBets.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* ---------- RECENT PLATFORM ACTIVITY ---------- */
const KIND_BADGE: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  bet_placed: {
    label: "BET",
    cls: "bg-primary/15 text-primary border-primary/30",
    icon: <TrendingUp className="h-3 w-3" />,
  },
  bet_won: {
    label: "WIN",
    cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    icon: <Trophy className="h-3 w-3" />,
  },
  payout_requested: {
    label: "PAYOUT",
    cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    icon: <HandCoins className="h-3 w-3" />,
  },
  payout_completed: {
    label: "PAID",
    cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  points_approved: {
    label: "APPROVED",
    cls: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    icon: <FileCheck className="h-3 w-3" />,
  },
};

export function RecentPlatformActivity() {
  const fn = useServerFn(getPublicRecentActivity);
  const q = useQuery({
    queryKey: ["public", "activity"],
    queryFn: () => fn({}),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const rows = (q.data ?? []).slice(0, 15);
  // re-tick to refresh relative time labels
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="bg-background py-12 sm:py-14">
      <div className="mx-auto max-w-3xl px-4">
        <SectionHeader
          kicker={<><Users className="h-3 w-3" /> Community</>}
          title="Recent Platform Activity"
          subtitle="Anonymised feed of what's happening on the platform right now."
        />
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-primary/20 bg-card/50 p-8 text-center text-sm text-muted-foreground">
            {q.isLoading ? "Loading activity…" : "Not enough data yet."}
          </div>
        ) : (
          <ul className="divide-y divide-border/60 rounded-md border border-border bg-card/60 overflow-hidden">
            {rows.map((r, i) => {
              const b = KIND_BADGE[r.kind] ?? KIND_BADGE.bet_placed;
              return (
                <li key={i} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${b.cls}`}
                  >
                    {b.icon} {b.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-foreground">{r.who}</span>{" "}
                    <span className="text-muted-foreground">{r.detail}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {timeAgo(r.at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ---------- PAYOUT PERFORMANCE ---------- */
export function PayoutPerformanceSection() {
  const fn = useServerFn(getPublicPayoutPerformance);
  const q = useQuery({
    queryKey: ["public", "payout-perf"],
    queryFn: () => fn({}),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const d = q.data;

  return (
    <section className="bg-gradient-to-b from-card/30 to-background py-12 sm:py-14">
      <div className="mx-auto max-w-5xl px-4">
        <SectionHeader
          kicker={<><Wallet className="h-3 w-3" /> Performance</>}
          title="Payout Performance"
          subtitle="All-time payout totals shown with this-week descriptions."
        />
        {q.isLoading && !d ? (
          <div className="rounded-md border border-dashed border-primary/20 bg-card/50 p-8 text-center text-sm text-muted-foreground">
            Loading payout performance…
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Winner points this week" value={fmt(Number(d?.winner_payout_points ?? 0))} />
            <Stat label="Bets placed this week" value={fmt(d?.bets_placed ?? 0)} />
            <Stat
              label="Payout success this week"
              value={
                d?.payout_success_rate != null
                  ? `${Math.round(Number(d.payout_success_rate) * 100)}%`
                  : null
              }
            />
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- BUILDING FOR THE LONG RUN ---------- */
export function BuildingLongRun() {
  return (
    <section className="bg-background py-12 sm:py-14">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <SectionHeader
          kicker={<><ShieldCheck className="h-3 w-3" /> Trust</>}
          title="Building for the Long Run"
        />
        <p className="text-sm text-foreground/90">
          CSSEBets is growing one member at a time.
        </p>
        <ul className="mx-auto mt-4 inline-grid gap-1.5 text-left text-sm text-muted-foreground">
          <li>• Fair settlements</li>
          <li>• Transparent operations</li>
          <li>• Responsive support</li>
          <li>• Fast approvals</li>
          <li>• Continuous improvement</li>
        </ul>
        <p className="mt-4 text-sm text-foreground/80">
          Thank you for being part of the journey.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link to="/trust-center">
            <Button size="sm" variant="outline" className="gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Trust Center
            </Button>
          </Link>
          <Link to="/status">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Platform Status
            </Button>
          </Link>
          <Link to="/changelog">
            <Button size="sm" variant="outline" className="gap-1.5">
              <FileCheck className="h-3.5 w-3.5" /> Changelog
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

