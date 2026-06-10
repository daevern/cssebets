import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  runSimulation, runScenarios, type SimInputs, type SimOutput, type ScenarioResult, type BetType,
} from "@/lib/simulator";
import { Play, TrendingUp, AlertTriangle, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/simulator")({
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
  head: () => ({ meta: [{ title: "Simulator — Admin" }] }),
  component: SimulatorPage,
});

const ALL_BET_TYPES: { value: BetType; label: string }[] = [
  { value: "match_winner", label: "Match Winner" },
  { value: "double_chance", label: "Double Chance" },
  { value: "over_under", label: "Over/Under" },
  { value: "btts", label: "Both Teams To Score" },
  { value: "correct_score", label: "Correct Score" },
  { value: "outright", label: "Outright Winner" },
];

const fmt = (n: number) => `RM${n.toLocaleString()}`;

function SimulatorPage() {
  const [inp, setInp] = useState<SimInputs>({
    users: 50,
    betsPerWeek: 125,
    weeks: 5,
    minStake: 10,
    maxStake: 1000,
    avgStake: 80,
    oddsSource: "margin5",
    customMargin: 5,
    behaviour: "mixed",
    betTypes: ["match_winner", "double_chance", "over_under", "btts", "correct_score", "outright"],
    iterations: 10000,
    startingBankroll: 50000,
  });
  const [out, setOut] = useState<SimOutput | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioResult[] | null>(null);
  const [running, setRunning] = useState(false);

  function run() {
    setRunning(true);
    setTimeout(() => {
      const o = runSimulation(inp);
      const s = runScenarios(inp);
      setOut(o);
      setScenarios(s);
      setRunning(false);
    }, 30);
  }

  const toggleType = (t: BetType) => {
    setInp((p) => ({
      ...p,
      betTypes: p.betTypes.includes(t)
        ? p.betTypes.filter((x) => x !== t)
        : [...p.betTypes, t],
    }));
  };

  const recommendation = useMemo(() => {
    if (!out) return null;
    const profitable = out.avgProfit > 0 && out.probProfit >= 60;
    return {
      profitable,
      bankroll: out.recommendedBankroll,
    };
  }, [out]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Bookmaker Profitability Simulator</h1>
          <p className="text-sm text-muted-foreground">
            Virtual-credit Monte Carlo model. No real money — analytics only.
          </p>
        </div>
        <Button onClick={run} disabled={running || inp.betTypes.length === 0}>
          <Play className="h-4 w-4 mr-2" />
          {running ? "Running…" : `Run ${inp.iterations.toLocaleString()} sims`}
        </Button>
      </div>

      {/* Inputs */}
      <Card>
        <CardHeader><CardTitle>Simulation Inputs</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label={`Users: ${inp.users}`}>
            <Slider min={10} max={100} step={1} value={[inp.users]} onValueChange={([v]) => setInp({ ...inp, users: v })} />
          </Field>
          <Field label={`Bets / week: ${inp.betsPerWeek}`}>
            <Slider min={100} max={150} step={1} value={[inp.betsPerWeek]} onValueChange={([v]) => setInp({ ...inp, betsPerWeek: v })} />
          </Field>
          <Field label={`Tournament weeks: ${inp.weeks}`}>
            <Slider min={1} max={8} step={1} value={[inp.weeks]} onValueChange={([v]) => setInp({ ...inp, weeks: v })} />
          </Field>
          <Field label="Min stake (RM)">
            <Input type="number" value={inp.minStake} onChange={(e) => setInp({ ...inp, minStake: +e.target.value })} />
          </Field>
          <Field label="Max stake (RM)">
            <Input type="number" value={inp.maxStake} onChange={(e) => setInp({ ...inp, maxStake: +e.target.value })} />
          </Field>
          <Field label="Average stake (RM)">
            <Input type="number" value={inp.avgStake} onChange={(e) => setInp({ ...inp, avgStake: +e.target.value })} />
          </Field>
          <Field label="Odds source">
            <Select value={inp.oddsSource} onValueChange={(v: any) => setInp({ ...inp, oddsSource: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="real">Real bookmaker odds</SelectItem>
                <SelectItem value="margin5">Real + 5% margin</SelectItem>
                <SelectItem value="margin10">Real + 10% margin</SelectItem>
                <SelectItem value="custom">Custom margin</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {inp.oddsSource === "custom" && (
            <Field label={`Custom margin: ${inp.customMargin}%`}>
              <Slider min={0} max={20} step={0.5} value={[inp.customMargin]} onValueChange={([v]) => setInp({ ...inp, customMargin: v })} />
            </Field>
          )}
          <Field label="User behaviour">
            <Select value={inp.behaviour} onValueChange={(v: any) => setInp({ ...inp, behaviour: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="random">Random bettors</SelectItem>
                <SelectItem value="casual">Casual (favourites bias)</SelectItem>
                <SelectItem value="sharp">Sharp (value bettors)</SelectItem>
                <SelectItem value="mixed">Mixed population</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Starting bankroll (RM)">
            <Input type="number" value={inp.startingBankroll} onChange={(e) => setInp({ ...inp, startingBankroll: +e.target.value })} />
          </Field>
          <Field label="Monte Carlo iterations">
            <Select value={String(inp.iterations)} onValueChange={(v) => setInp({ ...inp, iterations: +v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1000">1,000 (fast)</SelectItem>
                <SelectItem value="5000">5,000</SelectItem>
                <SelectItem value="10000">10,000 (default)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-3">
            <Label className="text-xs text-muted-foreground">Bet types included</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {ALL_BET_TYPES.map((t) => {
                const on = inp.betTypes.includes(t.value);
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => toggleType(t.value)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                      on
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-border hover:bg-muted/70"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {!out && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Configure inputs and click <b>Run</b> to start the simulation.
          </CardContent>
        </Card>
      )}

      {out && (
        <>
          {/* Headline metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Total turnover" value={fmt(out.turnover)} />
            <Metric label="Total payouts" value={fmt(out.payouts)} />
            <Metric label="Gross profit" value={fmt(out.grossProfit)} />
            <Metric label="Net profit (avg)" value={fmt(out.netProfit)} tone={out.netProfit >= 0 ? "good" : "bad"} />
            <Metric label="House edge" value={`${out.houseEdge}%`} />
            <Metric label="ROI" value={`${out.roi}%`} tone={out.roi >= 0 ? "good" : "bad"} />
            <Metric label="Prob. of profit" value={`${out.probProfit}%`} tone="good" />
            <Metric label="Prob. of loss" value={`${out.probLoss}%`} tone="bad" />
          </div>

          {/* Monte Carlo */}
          <Card>
            <CardHeader><CardTitle>Monte Carlo — {inp.iterations.toLocaleString()} runs</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-5">
              <Metric label="Average profit" value={fmt(out.avgProfit)} />
              <Metric label="Median profit" value={fmt(out.medianProfit)} />
              <Metric label="Best case" value={fmt(out.bestProfit)} tone="good" />
              <Metric label="Worst case" value={fmt(out.worstProfit)} tone="bad" />
              <Metric label="95% CI" value={`${fmt(out.ci95Low)} → ${fmt(out.ci95High)}`} />
            </CardContent>
          </Card>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Profit distribution (histogram)">
              <BarChart data={out.histogram}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
            </ChartCard>
            <ChartCard title="Weekly profit / cumulative">
              <LineChart data={out.weekly}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                <Line dataKey="profit" stroke="hsl(var(--primary))" />
                <Line dataKey="cumulative" stroke="hsl(var(--accent-foreground))" />
              </LineChart>
            </ChartCard>
            <ChartCard title="Liability exposure by match (top 12)">
              <BarChart data={out.liabilityByMatch}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="match" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="liability" fill="hsl(var(--destructive))" />
              </BarChart>
            </ChartCard>
            <ChartCard title="Bookmaker bankroll growth">
              <LineChart data={out.bankroll}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                <Line dataKey="bankroll" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ChartCard>
            <ChartCard title="Cash reserve requirement">
              <BarChart data={out.reserves}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="reserve" fill="hsl(var(--muted-foreground))" />
              </BarChart>
            </ChartCard>
          </div>

          {/* Risk */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Risk Analysis</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <Metric label="Recommended starting bankroll" value={fmt(out.recommendedBankroll)} />
              <Metric label="Bankruptcy probability" value={`${out.bankruptcyProb}%`} tone={out.bankruptcyProb > 5 ? "bad" : "good"} />
              <Metric label="Max drawdown (avg)" value={fmt(out.maxDrawdown)} />
              <Metric label="Expected value / bet" value={fmt(out.expectedValue)} />
              <Metric label="Largest single risk" value={fmt(out.largestSingleRisk)} />
              <Metric label="Largest possible payout" value={fmt(out.largestPayout)} />
            </CardContent>
          </Card>

          {/* Scenarios */}
          {scenarios && (
            <Card>
              <CardHeader><CardTitle>Scenario Comparison</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scenario</TableHead>
                      <TableHead>Expected profit</TableHead>
                      <TableHead>Expected payout</TableHead>
                      <TableHead>Max liability</TableHead>
                      <TableHead>Bankroll required</TableHead>
                      <TableHead>Chance of loss</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scenarios.map((s) => (
                      <TableRow key={s.label}>
                        <TableCell className="font-medium">{s.label}</TableCell>
                        <TableCell className={s.expectedProfit >= 0 ? "text-emerald-500" : "text-destructive"}>
                          {fmt(s.expectedProfit)}
                        </TableCell>
                        <TableCell>{fmt(s.expectedPayout)}</TableCell>
                        <TableCell>{fmt(s.maxLiability)}</TableCell>
                        <TableCell>{fmt(s.bankrollRequired)}</TableCell>
                        <TableCell>
                          <Badge variant={s.chanceOfLoss > 30 ? "destructive" : "secondary"}>
                            {s.chanceOfLoss}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Final recommendation */}
          {recommendation && (
            <Card className={recommendation.profitable ? "border-emerald-500/40" : "border-destructive/40"}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {recommendation.profitable ? (
                    <><ShieldCheck className="h-5 w-5 text-emerald-500" /> Expected to be profitable</>
                  ) : (
                    <><AlertTriangle className="h-5 w-5 text-destructive" /> High risk — not reliably profitable</>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  Across {inp.iterations.toLocaleString()} simulations the model predicts an
                  average net profit of <b>{fmt(out.avgProfit)}</b> with a{" "}
                  <b>{out.probProfit}%</b> chance of finishing the tournament in the green.
                </p>
                <p className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Recommended safe operating bankroll: <b>{fmt(recommendation.bankroll)}</b>
                  {out.bankruptcyProb > 0 && (
                    <span className="text-muted-foreground">
                      (bankruptcy risk at current bankroll: {out.bankruptcyProb}%)
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`text-lg font-semibold mt-1 ${
          tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
