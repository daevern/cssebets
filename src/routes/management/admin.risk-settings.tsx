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
import { Loader2, ShieldCheck } from "lucide-react";
import { getPlatformSettings, updatePlatformSettings } from "@/lib/platform-settings.functions";

export const Route = createFileRoute("/management/admin/risk-settings")({
  component: RiskSettingsPage,
});

function RiskSettingsPage() {
  const getFn = useServerFn(getPlatformSettings);
  const updFn = useServerFn(updatePlatformSettings);
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["platform-settings"], queryFn: () => getFn() });

  const [marginPct, setMarginPct] = useState("6");
  const [exposureCapPct, setExposureCapPct] = useState("0.6");
  const [maxStake, setMaxStake] = useState("5000");
  const [maxPayout, setMaxPayout] = useState("50000");
  const [applyMargin, setApplyMargin] = useState(true);

  useEffect(() => {
    const s = q.data;
    if (!s) return;
    setMarginPct(String(s.margin_pct));
    setExposureCapPct(String(s.exposure_cap_pct));
    setMaxStake(String(s.max_stake_per_bet));
    setMaxPayout(String(s.max_potential_payout));
    setApplyMargin(s.apply_margin_to_real);
  }, [q.data]);

  const mut = useMutation({
    mutationFn: () =>
      updFn({
        data: {
          marginPct: Number(marginPct),
          exposureCapPct: Number(exposureCapPct),
          maxStakePerBet: Number(maxStake),
          maxPotentialPayout: Number(maxPayout),
          applyMarginToReal: applyMargin,
        },
      }),
    onSuccess: () => {
      toast.success("Risk settings updated. Applies to real bets only.");
      qc.invalidateQueries({ queryKey: ["platform-settings"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update"),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> House risk settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Controls applied to <strong>real</strong> bets only. Simulation flows are unaffected.
        </p>
      </div>

      {q.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <Card className="p-5 space-y-4">
          <Row label="House margin (%)" hint="Target overround applied to real reference odds on next sync. 6 = 6% margin.">
            <Input
              type="number"
              step="0.1"
              min={0}
              max={50}
              value={marginPct}
              onChange={(e) => setMarginPct(e.target.value)}
            />
          </Row>

          <Row label="Apply margin to real odds" hint="When off, raw bookmaker median odds are stored (zero house edge).">
            <Switch checked={applyMargin} onCheckedChange={setApplyMargin} />
          </Row>

          <Row label="Exposure cap (fraction of bankroll)" hint="Global worst-case payout cannot exceed bankroll × this fraction. e.g. 0.6 = 60%.">
            <Input
              type="number"
              step="0.05"
              min={0.01}
              max={1}
              value={exposureCapPct}
              onChange={(e) => setExposureCapPct(e.target.value)}
            />
          </Row>

          <Row label="Max stake per bet (pts)" hint="0 = no cap.">
            <Input type="number" min={0} value={maxStake} onChange={(e) => setMaxStake(e.target.value)} />
          </Row>

          <Row label="Max potential payout (pts)" hint="Caps stake × odds for a single bet. 0 = no cap.">
            <Input type="number" min={0} value={maxPayout} onChange={(e) => setMaxPayout(e.target.value)} />
          </Row>

          <div className="pt-2">
            <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
              {mut.isPending ? "Saving…" : "Save risk settings"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Margin changes affect <em>future</em> odds syncs only; previously-stored odds keep their value.
            Exposure cap and per-bet caps take effect immediately on the next bet placement.
          </p>
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
