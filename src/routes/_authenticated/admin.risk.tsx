import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { getRiskDashboard, type RiskDashboard, type MatchRisk } from "@/lib/risk.functions";
import {
  AlertTriangle, ShieldCheck, RefreshCw, ChevronDown, TrendingDown, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/risk")({
  ssr: false,
  beforeLoad: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const has = (roles ?? []).some((r) =>
      ["admin", "super_admin", "viewer"].includes(r.role as string),
    );
    if (!has) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Risk — Admin" }] }),
  component: RiskPage,
});

const fmt = (n: number) => `RM${Math.round(n).toLocaleString()}`;

const REC_META: Record<MatchRisk["recommendation"], { label: string; tone: string }> = {
  accept: { label: "Accept bets", tone: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  limit_stake: { label: "Limit max stake", tone: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  reduce_odds: { label: "Reduce odds", tone: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  close_market: { label: "Close market", tone: "bg-destructive/10 text-destructive border-destructive/30" },
};

function RiskPage() {
  const load = useServerFn(getRiskDashboard);
  const [data, setData] = useState<RiskDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [bankroll, setBankroll] = useState(50000);
  const [userPct, setUserPct] = useState(15);

  async function refresh() {
    setLoading(true);
    try {
      const d = await load({ data: { bankroll, userExposurePct: userPct } });
      setData(d);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Risk Management</h1>
          <p className="text-sm text-muted-foreground">
            Live exposure per match and per outcome. Virtual credits only.
          </p>
        </div>
        <Button onClick={refresh} disabled={loading} variant="outline">
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Risk parameters</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Admin bankroll / reserve (RM)</Label>
            <Input
              type="number"
              value={bankroll}
              onChange={(e) => setBankroll(+e.target.value || 0)}
              onBlur={refresh}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Single user exposure threshold (% of bankroll)</Label>
            <Input
              type="number"
              value={userPct}
              onChange={(e) => setUserPct(+e.target.value || 0)}
              onBlur={refresh}
            />
          </div>
        </CardContent>
      </Card>

      {/* Headline */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Total open stake" value={fmt(data?.totalStake ?? 0)} />
        <Metric label="Potential payout (all outcomes)" value={fmt(data?.totalPotentialPayout ?? 0)} />
        <Metric
          label="Total worst-case liability"
          value={fmt(data?.totalWorstCaseLiability ?? 0)}
          tone={data && data.totalWorstCaseLiability > data.bankroll ? "bad" : "good"}
        />
        <Metric label="Bankroll utilisation"
          value={data ? `${((data.totalWorstCaseLiability / Math.max(1, data.bankroll)) * 100).toFixed(0)}%` : "—"}
          tone={data && data.totalWorstCaseLiability > data.bankroll ? "bad" : undefined}
        />
      </div>

      {/* Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Alerts {data && <Badge variant="secondary">{data.alerts.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data && data.alerts.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> No active risk alerts.
            </div>
          )}
          {data?.alerts.map((a, i) => (
            <div
              key={i}
              className={cn(
                "rounded-md border px-3 py-2 text-sm flex items-start gap-2",
                a.level === "critical"
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400",
              )}
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium uppercase text-[10px] tracking-wide opacity-70">
                  {a.type.replace(/_/g, " ")} · {a.level}
                </div>
                {a.message}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Per-match table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exposure by match</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !data && (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
          )}
          {data && data.matches.length === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">No open predictions.</div>
          )}
          <div className="space-y-2">
            {data?.matches.map((m) => (
              <MatchRow key={m.matchId} m={m} bankroll={data.bankroll} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MatchRow({ m, bankroll }: { m: MatchRisk; bankroll: number }) {
  const [open, setOpen] = useState(false);
  const rec = REC_META[m.recommendation];
  const liabilityPct = bankroll > 0 ? (m.worstCaseLiability / bankroll) * 100 : 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-card">
      <CollapsibleTrigger className="w-full text-left">
        <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-muted/50 rounded-lg">
          <ChevronDown className={cn("h-4 w-4 transition-transform shrink-0", open && "rotate-180")} />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{m.match}</div>
            <div className="text-xs text-muted-foreground">
              {m.bets} bets · stake {fmt(m.totalStake)} · liability {fmt(m.worstCaseLiability)}
              {bankroll > 0 && ` (${liabilityPct.toFixed(0)}% of bankroll)`}
            </div>
          </div>
          <Badge variant="outline" className="capitalize">{m.status}</Badge>
          <span className={cn("text-xs px-2 py-1 rounded-md border font-medium", rec.tone)}>
            {rec.label}
          </span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3 space-y-3">
          {m.reasons.length > 0 && (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
              <TrendingDown className="h-3 w-3" />
              {m.reasons.join(" · ")}
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Market</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="text-right">Bets</TableHead>
                <TableHead className="text-right">Stake</TableHead>
                <TableHead className="text-right">Share</TableHead>
                <TableHead className="text-right">Potential payout</TableHead>
                <TableHead className="text-right">Net if wins</TableHead>
                <TableHead className="text-right">Liability if wins</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {m.outcomes.map((o) => (
                <TableRow key={o.key} className={o.key === m.worstOutcomeKey ? "bg-destructive/5" : ""}>
                  <TableCell className="capitalize">{o.market.replace(/_/g, " ")}</TableCell>
                  <TableCell className="font-medium">{o.outcome}</TableCell>
                  <TableCell className="text-right">{o.bets}</TableCell>
                  <TableCell className="text-right">{fmt(o.stake)}</TableCell>
                  <TableCell className="text-right">
                    <span className={o.shareOfMatch > 0.5 ? "text-destructive font-medium" : ""}>
                      {(o.shareOfMatch * 100).toFixed(0)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{fmt(o.potentialPayout)}</TableCell>
                  <TableCell className={cn("text-right", o.netIfWins >= 0 ? "text-emerald-600" : "text-destructive")}>
                    {fmt(o.netIfWins)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-destructive">
                    {fmt(o.liabilityIfWins)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {m.topUsers.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <Users className="h-3 w-3" /> Top user exposure
              </div>
              <div className="flex flex-wrap gap-2">
                {m.topUsers.map((u) => (
                  <span key={u.userId} className="text-xs rounded-md border px-2 py-1 bg-muted/40">
                    {u.name}: stake {fmt(u.stake)} · exposure {fmt(u.exposure)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn(
        "text-lg font-semibold mt-1",
        tone === "good" && "text-emerald-600",
        tone === "bad" && "text-destructive",
      )}>{value}</div>
    </div>
  );
}
