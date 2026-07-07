import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { getPlatformSettings, repriceOpenMatchOdds, updatePlatformSettings } from "@/lib/platform-settings.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/management/admin/risk-settings")({
  component: RiskSettingsPage,
});

const MARKET_KEYS = [
  "over_under_2_5",
  "btts",
  "correct_score",
  "half_time_full_time",
  "exact_total_goals",
] as const;

function RiskSettingsPage() {
  const getFn = useServerFn(getPlatformSettings);
  const updFn = useServerFn(updatePlatformSettings);
  const repriceFn = useServerFn(repriceOpenMatchOdds);
  const qc = useQueryClient();

  const [hasSession, setHasSession] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const q = useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return null;
      return getFn();
    },
    enabled: hasSession === true,
  });

  const [marginPct, setMarginPct] = useState("6");
  const [exposureCapPct, setExposureCapPct] = useState("0.6");
  const [maxStake, setMaxStake] = useState("5000");
  const [maxPayout, setMaxPayout] = useState("50000");
  const [applyMargin, setApplyMargin] = useState(true);
  const [betsPaused, setBetsPaused] = useState(false);
  const [csDisabled, setCsDisabled] = useState(false);
  const [highOddsDisabled, setHighOddsDisabled] = useState(false);
  const [highOddsThreshold, setHighOddsThreshold] = useState("50");
  const [disabledMarkets, setDisabledMarkets] = useState<string[]>([]);
  const [maxBetsPerMatch, setMaxBetsPerMatch] = useState("0");

  useEffect(() => {
    const s = q.data as any;
    if (!s) return;
    setMarginPct(String(s.margin_pct));
    setExposureCapPct(String(s.exposure_cap_pct));
    setMaxStake(String(s.max_stake_per_bet));
    setMaxPayout(String(s.max_potential_payout));
    setApplyMargin(s.apply_margin_to_real);
    setBetsPaused(!!s.bets_paused);
    setCsDisabled(!!s.correct_score_disabled);
    setHighOddsDisabled(!!s.high_odds_disabled);
    setHighOddsThreshold(String(s.high_odds_threshold ?? 50));
    setDisabledMarkets(s.disabled_markets ?? []);
    setMaxBetsPerMatch(String(s.max_bets_per_user_per_match ?? 0));
  }, [q.data]);

  // Recent rate-limit warnings + high-payout blocks for admin awareness
  const warnings = useQuery({
    queryKey: ["risk-warnings"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from("audit_log")
        .select("id, action, created_at, metadata, user_id")
        .in("action", ["rate_limit_triggered", "high_payout_attempt_blocked", "reconciliation.drift_detected"])
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const mut = useMutation({
    mutationFn: async () => {
      await updFn({
        data: {
          marginPct: Number(marginPct),
          exposureCapPct: Number(exposureCapPct),
          maxStakePerBet: Number(maxStake),
          maxPotentialPayout: Number(maxPayout),
          applyMarginToReal: applyMargin,
          betsPaused,
          correctScoreDisabled: csDisabled,
          highOddsDisabled,
          highOddsThreshold: Number(highOddsThreshold),
          disabledMarkets,
          maxBetsPerUserPerMatch: Number(maxBetsPerMatch),
        },
      });
      return repriceFn();
    },
    onSuccess: (result: any) => {
      toast.success(`Risk settings updated. Repriced ${Number(result?.updatedRows ?? 0).toLocaleString()} open-market odds.`);
      qc.invalidateQueries({ queryKey: ["platform-settings"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update"),
  });

  const toggleMarket = (m: string) =>
    setDisabledMarkets((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> House risk &amp; emergency controls
        </h1>
        <p className="text-sm text-muted-foreground">
          Controls applied to <strong>real</strong> bets only. Simulation flows are unaffected.
        </p>
      </div>

      {/* Admin warnings */}
      <Card className="p-4 space-y-2 border-yellow-500/30">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          Recent risk events (24h)
        </div>
        {warnings.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (warnings.data ?? []).length === 0 ? (
          <div className="text-xs text-muted-foreground">No warnings in the last 24 hours.</div>
        ) : (
          <ul className="text-xs space-y-1 max-h-48 overflow-auto">
            {warnings.data!.map((w: any) => (
              <li key={w.id} className="flex justify-between gap-2 font-mono">
                <span className="truncate">
                  <strong>{w.action}</strong> — {JSON.stringify(w.metadata)}
                </span>
                <span className="text-muted-foreground shrink-0">{new Date(w.created_at).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {q.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <Card className="p-5 space-y-5">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">Emergency controls</h2>
            <Row label="Pause all bet placement" hint="Blocks every new real bet immediately.">
              <Switch checked={betsPaused} onCheckedChange={setBetsPaused} />
            </Row>
            <Row label="Disable correct-score market" hint="Hide / reject all correct-score bets.">
              <Switch checked={csDisabled} onCheckedChange={setCsDisabled} />
            </Row>
            <Row label="Disable high-odds markets" hint="Reject any bet at odds ≥ threshold.">
              <Switch checked={highOddsDisabled} onCheckedChange={setHighOddsDisabled} />
            </Row>
            <Row label="High-odds threshold">
              <Input type="number" min={1} value={highOddsThreshold} onChange={(e) => setHighOddsThreshold(e.target.value)} />
            </Row>
            <Row label="Globally disabled markets" hint="Tick to block a market for everyone.">
              <div className="flex flex-wrap gap-2">
                {MARKET_KEYS.map((m) => (
                  <label key={m} className="flex items-center gap-1 text-xs border rounded px-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={disabledMarkets.includes(m)}
                      onChange={() => toggleMarket(m)}
                    />
                    {m}
                  </label>
                ))}
              </div>
            </Row>
            <Row label="Max bets per user per match" hint="0 = no limit.">
              <Input type="number" min={0} value={maxBetsPerMatch} onChange={(e) => setMaxBetsPerMatch(e.target.value)} />
            </Row>
          </section>

          <section className="space-y-3 pt-3 border-t">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">House parameters</h2>
            <Row label="House margin (%)" hint="Target overround on next odds sync. 6 = 6% margin.">
              <Input type="number" step="0.1" min={0} max={50} value={marginPct} onChange={(e) => setMarginPct(e.target.value)} />
            </Row>
            <Row label="Apply margin to real odds" hint="When off, raw bookmaker median odds are stored (zero house edge).">
              <Switch checked={applyMargin} onCheckedChange={setApplyMargin} />
            </Row>
            <Row label="Exposure cap (fraction of bankroll)" hint="Worst-case payout cannot exceed bankroll × this fraction.">
              <Input type="number" step="0.05" min={0.01} max={1} value={exposureCapPct} onChange={(e) => setExposureCapPct(e.target.value)} />
            </Row>
            <Row label="Max stake per bet (pts)" hint="0 = no cap.">
              <Input type="number" min={0} value={maxStake} onChange={(e) => setMaxStake(e.target.value)} />
            </Row>
            <Row label="Max potential payout (pts)" hint="Required (>0). Caps stake × odds for a single bet.">
              <Input type="number" min={1} value={maxPayout} onChange={(e) => setMaxPayout(e.target.value)} />
            </Row>
          </section>

          <div className="pt-2">
            <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
              {mut.isPending ? "Saving…" : "Save risk &amp; emergency settings"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3 items-start">
      <div>
        <Label className="text-sm">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}
