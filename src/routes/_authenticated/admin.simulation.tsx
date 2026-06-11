import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Play, Pause, RotateCcw, Sprout, Zap, Loader2, FastForward, Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  seedSimulationUsers,
  seedSimulationMatches,
  seedSimulationPredictions,
  setSimulationBankroll,
  runSimulationTick,
  resetSimulationData,
  getSimulationOverview,
  getSimulationUsers,
  getSimulationMatches,
  validateSimulationSeed,
} from "@/lib/simulation.functions";


export const Route = createFileRoute("/_authenticated/admin/simulation")({
  component: SimulationPage,
});

const fmt = (n: number) => (n >= 0 ? "" : "-") + `${Math.abs(Math.round(n)).toLocaleString()} pts`;

function SimulationPage() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getSimulationOverview);
  const usersFn = useServerFn(getSimulationUsers);
  const matchesFn = useServerFn(getSimulationMatches);
  const seedUsersFn = useServerFn(seedSimulationUsers);
  const seedMatchesFn = useServerFn(seedSimulationMatches);
  const seedPredsFn = useServerFn(seedSimulationPredictions);
  const tickFn = useServerFn(runSimulationTick);
  const resetFn = useServerFn(resetSimulationData);
  const validateFn = useServerFn(validateSimulationSeed);

  const [running, setRunning] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [durationMin, setDurationMin] = useState<number>(1);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [showConfig, setShowConfig] = useState(false);
  const [validation, setValidation] = useState<{ configured: number; average: number; total: number; users: number } | null>(null);

  const setBankrollFn = useServerFn(setSimulationBankroll);

  // Seed configuration (admin-tunable)
  const [cfg, setCfg] = useState({
    totalUsers: 100,
    matchCount: 25,
    startingBalance: 1000,
    bankroll: 50000,
    minUsersPerMatch: 10,
    maxUsersPerMatch: 30,
    minStake: 50,
    maxStake: 300,
    exposureTargetPct: 60, // %
  });
  const setCfgField = (k: keyof typeof cfg, v: number) => setCfg((c) => ({ ...c, [k]: v }));

  // 1s clock for visible countdown timers
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const overview = useQuery({ queryKey: ["sim-overview"], queryFn: () => overviewFn(), refetchInterval: 5000 });
  const users = useQuery({ queryKey: ["sim-users"], queryFn: () => usersFn(), refetchInterval: 15000 });
  const matches = useQuery({ queryKey: ["sim-matches"], queryFn: () => matchesFn(), refetchInterval: 5000 });

  // Auto-tick every 10s while running
  useEffect(() => {
    if (!running) return;
    const id = setInterval(async () => {
      try {
        await tickFn({ data: { durationMinutes: durationMin } });
        qc.invalidateQueries({ queryKey: ["sim-overview"] });
        qc.invalidateQueries({ queryKey: ["sim-matches"] });
      } catch { /* swallow */ }
    }, 10_000);
    return () => clearInterval(id);
  }, [running, tickFn, qc, durationMin]);

  const tickMut = useMutation({
    mutationFn: () => tickFn({ data: { durationMinutes: durationMin } }),
    onSuccess: (r: any) => {
      toast.success(`Tick: started ${r?.started ?? 0}, settled ${r?.settled ?? 0}`);
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const settleAllMut = useMutation({
    mutationFn: async () => {
      // Run multiple ticks back-to-back to drain any backlog of due matches.
      let total = { started: 0, settled: 0 };
      for (let i = 0; i < 5; i++) {
        const r: any = await tickFn({ data: { durationMinutes: durationMin } });
        total.started += r?.started ?? 0;
        total.settled += r?.settled ?? 0;
        if ((r?.started ?? 0) === 0 && (r?.settled ?? 0) === 0) break;
      }
      return total;
    },
    onSuccess: (r) => { toast.success(`Settle pass: started ${r.started}, settled ${r.settled}`); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const resetMut = useMutation({
    mutationFn: () => resetFn(),
    onSuccess: () => { toast.success("Simulation data reset"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  async function handleSeed() {
    setSeeding(true);
    setValidation(null);
    try {
      toast.info("Resetting prior simulation data…");
      await resetFn();

      toast.info(`Setting simulation bankroll to ${cfg.bankroll.toLocaleString()} pts…`);
      await setBankrollFn({ data: { balance: cfg.bankroll } });

      toast.info(`Seeding ${cfg.totalUsers} simulation users @ ${cfg.startingBalance} pts each…`);
      for (let start = 1; start <= cfg.totalUsers; start += 25) {
        const batch = Math.min(25, cfg.totalUsers - start + 1);
        const res: any = await seedUsersFn({ data: {
          start, count: batch,
          totalUsers: cfg.totalUsers,
          startingBalance: cfg.startingBalance,
        }});
        toast.message(`Users ${res.processedRange[0]}-${res.processedRange[1]}: ${res.created} new, ${res.skipped} existing`);
      }

      // Validate actual vs configured starting balance
      const v: any = await validateFn();
      setValidation({
        configured: cfg.startingBalance,
        average: v.averageBalance,
        total: v.totalIssued,
        users: v.userCount,
      });
      if (Math.abs((v.averageBalance ?? 0) - cfg.startingBalance) > 0.5) {
        toast.warning(`Avg starting balance ${Math.round(v.averageBalance)} ≠ configured ${cfg.startingBalance}`);
      } else {
        toast.success(`Starting balance verified: ${cfg.startingBalance} pts × ${v.userCount} users = ${v.totalIssued.toLocaleString()} pts`);
      }

      toast.info(`Seeding ${cfg.matchCount} simulation matches…`);
      await seedMatchesFn({ data: { matchCount: cfg.matchCount } });
      toast.info("Placing random predictions (will stop at exposure target)…");
      const pr: any = await seedPredsFn({ data: {
        minUsersPerMatch: cfg.minUsersPerMatch,
        maxUsersPerMatch: cfg.maxUsersPerMatch,
        minStake: cfg.minStake,
        maxStake: cfg.maxStake,
        exposureTargetPct: cfg.exposureTargetPct / 100,
      }});
      if (pr.stoppedAtCap) {
        toast.warning(`Stopped at ${cfg.exposureTargetPct}% exposure cap after ${pr.predictionsCreated} predictions.`);
      } else {
        toast.success(`Done. ${pr.predictionsCreated ?? 0} predictions placed (${pr.predictionsFailed ?? 0} failed).`);
      }
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message ?? "Seed failed");
    } finally {
      setSeeding(false);
    }
  }


  const o = overview.data;

  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Simulation Mode — test data only.</AlertTitle>
        <AlertDescription>
          Virtual points only. Fake users, fake matches, random results. Login: <code>simuser001@test.local</code> … <code>simuser100@test.local</code> · password <code>123456789</code>.
          Do not use shared passwords outside local/test simulation environments.
        </AlertDescription>
      </Alert>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSeed} disabled={seeding}>
            {seeding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sprout className="h-4 w-4 mr-2" />}
            Seed Simulation ({cfg.matchCount} matches · {cfg.totalUsers} users)
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowConfig((v) => !v)}>
            <Settings2 className="h-4 w-4 mr-2" /> {showConfig ? "Hide" : "Configure"} Seed Settings
          </Button>
          <Button variant={running ? "secondary" : "default"} onClick={() => setRunning((v) => !v)}>
            {running ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {running ? "Pause Auto-Tick" : "Start Auto-Tick (10s)"}
          </Button>
          <Button variant="outline" onClick={() => tickMut.mutate()} disabled={tickMut.isPending}>
            <Zap className="h-4 w-4 mr-2" /> Run Tick Now
          </Button>
          <Button variant="outline" onClick={() => settleAllMut.mutate()} disabled={settleAllMut.isPending}>
            <FastForward className="h-4 w-4 mr-2" /> Settle All Due Matches Now
          </Button>
          <div className="flex items-center gap-2 ml-2">
            <Label className="text-xs text-muted-foreground">Match duration</Label>
            <Select value={String(durationMin)} onValueChange={(v) => setDurationMin(Number(v))}>
              <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 minute</SelectItem>
                <SelectItem value="2">2 minutes</SelectItem>
                <SelectItem value="5">5 minutes</SelectItem>
                <SelectItem value="10">10 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="destructive" onClick={() => { if (confirm("Delete ALL simulation data?")) resetMut.mutate(); }} disabled={resetMut.isPending}>
            <RotateCcw className="h-4 w-4 mr-2" /> Reset Simulation
          </Button>
        </div>

        <Collapsible open={showConfig}>
          <CollapsibleContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
              <CfgInput label="Users" v={cfg.totalUsers} on={(n) => setCfgField("totalUsers", n)} />
              <CfgInput label="Matches" v={cfg.matchCount} on={(n) => setCfgField("matchCount", n)} />
              <CfgInput label="Starting balance (pts)" v={cfg.startingBalance} on={(n) => setCfgField("startingBalance", n)} />
              <CfgInput label="Sim bankroll (pts)" v={cfg.bankroll} on={(n) => setCfgField("bankroll", n)} />
              <CfgInput label="Min users / match" v={cfg.minUsersPerMatch} on={(n) => setCfgField("minUsersPerMatch", n)} />
              <CfgInput label="Max users / match" v={cfg.maxUsersPerMatch} on={(n) => setCfgField("maxUsersPerMatch", n)} />
              <CfgInput label="Min stake" v={cfg.minStake} on={(n) => setCfgField("minStake", n)} />
              <CfgInput label="Max stake" v={cfg.maxStake} on={(n) => setCfgField("maxStake", n)} />
              <CfgInput label="Exposure target (%)" v={cfg.exposureTargetPct} on={(n) => setCfgField("exposureTargetPct", n)} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Seeding stops creating predictions once global exposure reaches {cfg.exposureTargetPct}% of the simulation bankroll, so matches can settle before bankroll is fully committed.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {o && o.bankroll.safetyRatio !== null && o.bankroll.safetyRatio < 1.1 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Simulation bankroll is almost fully exposed</AlertTitle>
          <AlertDescription>
            Safety ratio is {o.bankroll.safetyRatio.toFixed(2)}×. New predictions may be rejected until matches settle or the bankroll is topped up.
          </AlertDescription>
        </Alert>
      )}

      {o && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Sim Bankroll" value={fmt(o.bankroll.balance)} />
          <Stat label="Global Exposure" value={fmt(o.bankroll.globalExposure)} />
          <Stat label="Available" value={fmt(o.bankroll.availableBalance)} tone={o.bankroll.availableBalance < 0 ? "bad" : "ok"} />
          <Stat label="Safety Ratio" value={o.bankroll.safetyRatio ? o.bankroll.safetyRatio.toFixed(2) + "×" : "—"} tone={o.bankroll.safetyRatio !== null && o.bankroll.safetyRatio < 1.25 ? "warn" : undefined} />
          <Stat label="Pending Pools" value={fmt(o.bankroll.pendingPools)} />
          <Stat label="Settled Pools" value={String(o.bankroll.settledPools)} />
          <Stat label="Total Stakes" value={fmt(o.bankroll.totalStakes)} />
          <Stat label="Total Payouts" value={fmt(o.bankroll.totalPayouts)} />
          <Stat label="Sim Net P/L" value={fmt(o.bankroll.netPL)} tone={o.bankroll.netPL >= 0 ? "ok" : "bad"} />
          <Stat label="Users" value={String(o.users.total)} />
          <Stat label="Matches" value={`${o.matches.total} (sched ${o.matches.scheduled}/live ${o.matches.live}/fin ${o.matches.finished})`} />
          <Stat label="Predictions" value={String(o.predictions.total)} />
          {o.highestWinner && (
            <Stat
              label={`${o.anySettled ? "Top Winner" : "Best Current P/L"} — ${o.highestWinner.displayName}`}
              value={fmt(o.highestWinner.pl)}
              tone={o.highestWinner.pl >= 0 ? "ok" : undefined}
            />
          )}
          {o.lowestLoser && (
            <Stat
              label={`${o.anySettled ? "Top Loser" : "Worst Current P/L"} — ${o.lowestLoser.displayName}`}
              value={fmt(o.lowestLoser.pl)}
              tone={o.lowestLoser.pl < 0 ? "bad" : undefined}
            />
          )}
        </div>
      )}

      <Tabs defaultValue="matches">
        <TabsList>
          <TabsTrigger value="matches">Matches</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        <TabsContent value="matches">
          <Card className="p-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Match</TableHead>
                  <TableHead>Kickoff</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Timer</TableHead>
                  <TableHead>Odds H/D/A</TableHead>
                  <TableHead className="text-right">Pool</TableHead>
                  <TableHead className="text-right">H/D/A pool</TableHead>
                  <TableHead className="text-right">Worst</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="text-right">Payouts</TableHead>
                  <TableHead className="text-right">P/L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(matches.data?.matches ?? []).map((m: any) => {
                  const kickoffMs = new Date(m.kickoff).getTime();
                  const settleMs = kickoffMs + durationMin * 60_000;
                  let timer = "—";
                  if (m.status === "scheduled") {
                    const s = Math.max(0, Math.ceil((kickoffMs - nowTs) / 1000));
                    timer = s > 0 ? `Starts in ${s}s` : "Starting…";
                  } else if (m.status === "live") {
                    const s = Math.max(0, Math.ceil((settleMs - nowTs) / 1000));
                    timer = s > 0 ? `Settles in ${s}s` : "Settling…";
                  } else if (m.status === "finished") {
                    timer = "Settled";
                  } else if (m.status === "cancelled") {
                    timer = "Voided";
                  }
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.label}</TableCell>
                      <TableCell className="text-xs">{new Date(m.kickoff).toLocaleTimeString()}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{m.status}</Badge></TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{timer}</TableCell>
                      <TableCell className="text-xs">{m.odds?.home}/{m.odds?.draw}/{m.odds?.away}</TableCell>
                      <TableCell className="text-right">{fmt(m.totalPool)}</TableCell>
                      <TableCell className="text-right text-xs">{fmt(m.homePool)}/{fmt(m.drawPool)}/{fmt(m.awayPool)}</TableCell>
                      <TableCell className="text-right">{fmt(m.worst)}</TableCell>
                      <TableCell>{m.finalScore ?? "—"}</TableCell>
                      <TableCell className="text-right">{fmt(m.payouts)}</TableCell>
                      <TableCell className={`text-right font-medium ${m.profitLoss >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmt(m.profitLoss)}</TableCell>
                    </TableRow>
                  );
                })}
                {!matches.data?.matches?.length && (
                  <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">No simulation matches.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card className="p-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead className="text-right">Wallet Balance</TableHead>
                  <TableHead className="text-right">Bets</TableHead>
                  <TableHead className="text-right">Pending Stakes</TableHead>
                  <TableHead className="text-right">Settled P/L</TableHead>
                  <TableHead className="text-right">Total P/L</TableHead>
                  <TableHead>Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(users.data?.users ?? []).map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.displayName}</TableCell>
                    <TableCell className="text-xs"><code>{u.email}</code></TableCell>
                    <TableCell className="text-xs"><code>{u.password}</code></TableCell>
                    <TableCell className="text-right">{fmt(u.balance)}</TableCell>
                    <TableCell className="text-right">{u.predictionCount}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmt(u.pendingStakes ?? 0)}</TableCell>
                    <TableCell className={`text-right ${(u.settledPL ?? 0) >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmt(u.settledPL ?? 0)}</TableCell>
                    <TableCell className={`text-right font-medium ${(u.totalPL ?? 0) >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmt(u.totalPL ?? 0)}</TableCell>
                    <TableCell className="text-xs">{u.lastActivity ? new Date(u.lastActivity).toLocaleString() : "—"}</TableCell>
                  </TableRow>
                ))}
                {!users.data?.users?.length && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No simulation users. Click Seed.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CfgInput({ label, v, on }: { label: string; v: number; on: (n: number) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={v}
        onChange={(e) => on(Number(e.target.value) || 0)}
        className="h-8"
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" | "warn" }) {
  const color = tone === "ok" ? "text-emerald-600" : tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-600" : "";
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground truncate">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </Card>
  );
}
