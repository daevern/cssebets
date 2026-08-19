import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getLivePulse } from "@/lib/ops-pulse.functions";
import { useHasSession, withSession } from "@/hooks/use-staff-session";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/management/admin/pulse")({
  head: () => ({ meta: [{ title: "Live pulse — Admin" }] }),
  component: PulsePage,
});

function fmtBytes(n: number | null | undefined) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (abs >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  if (abs >= 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${Math.round(n)} B`;
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn" | "bad";
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
        {tone ? (
          <Badge variant={tone === "ok" ? "outline" : tone === "warn" ? "secondary" : "destructive"}>
            {tone === "ok" ? "healthy" : tone === "warn" ? "elevated" : "high"}
          </Badge>
        ) : null}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div> : null}
    </Card>
  );
}

function PulsePage() {
  const hasSession = useHasSession();
  const pulseFn = useServerFn(getLivePulse);

  const q = useQuery({
    queryKey: ["live-pulse"],
    queryFn: () => withSession(() => pulseFn({})),
    enabled: hasSession === true,
    refetchInterval: 10_000,
  });

  const p = q.data;

  const series = useMemo(() => {
    const hist = [...(p?.history ?? [])].sort(
      (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime(),
    );
    return hist.map((h, i) => {
      const prev = hist[i - 1];
      const secs = prev
        ? Math.max(
            (new Date(h.captured_at).getTime() - new Date(prev.captured_at).getTime()) / 1000,
            1,
          )
        : null;
      return {
        t: new Date(h.captured_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        active: h.active_users,
        balance: Number(h.total_balance),
        walMb: prev && secs ? ((Number(h.wal_bytes) - Number(prev.wal_bytes)) / secs * 60) / 1024 ** 2 : 0,
      };
    });
  }, [p?.history]);

  const walPerMin = p?.wal_bytes_per_min ?? null;
  const walMb = walPerMin == null ? null : walPerMin / 1024 ** 2;
  const walTone = walMb == null ? undefined : walMb > 8 ? "bad" : walMb > 3 ? "warn" : "ok";
  const ckph = p?.checkpoints_per_hour ?? null;
  const ckTone = ckph == null ? undefined : ckph > 12 ? "bad" : ckph > 6 ? "warn" : "ok";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Live pulse</h1>
        <p className="text-sm text-muted-foreground">
          Refreshes every 10s. Write-ahead-log (WAL) rate is the volume of database writes per
          minute — the main driver of disk IO. Checkpoints flush those writes to disk.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Active players (5m)"
          value={p ? String(p.active_users) : "—"}
          sub="Distinct users with a wallet move or bet"
        />
        <Stat
          label="Total player balance"
          value={p ? `${Math.round(Number(p.total_balance)).toLocaleString()} pts` : "—"}
          sub={`${p?.db_connections ?? "—"} DB connections`}
        />
        <Stat
          label="WAL write rate"
          value={walMb == null ? "sampling…" : `${walMb.toFixed(2)} MB/min`}
          sub={p?.sample_gap_seconds ? `over last ${Math.round(p.sample_gap_seconds)}s` : "first sample"}
          tone={walTone}
        />
        <Stat
          label="Checkpoints"
          value={ckph == null ? "sampling…" : `${ckph.toFixed(1)} /hour`}
          sub={p ? `${p.checkpoints_total.toLocaleString()} since boot` : undefined}
          tone={ckTone}
        />
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">WAL rate (MB/min)</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 10 }} width={40} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="walMb"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary) / 0.2)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Active players</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 10 }} width={40} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="active"
                  stroke="hsl(var(--chart-2, var(--primary)))"
                  fill="hsl(var(--primary) / 0.15)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Total balance (pts)</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 10 }} width={56} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary) / 0.12)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Cumulative WAL position: {fmtBytes(p?.wal_bytes)} · {q.isFetching ? "refreshing…" : "live"}
      </p>
    </div>
  );
}
