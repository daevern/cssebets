import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  adminListOnboardingUsers,
  adminResetOnboarding,
  adminSetGlobalOnboarding,
  adminSetOnboardingEnabled,
  getOnboardingStats,
  getOnboardingStatus,
} from "@/lib/onboarding.functions";
import { Loader2, Search, RotateCcw, Power, CheckCircle2, XCircle, Clock } from "lucide-react";

export const Route = createFileRoute("/management/admin/onboarding")({
  head: () => ({ meta: [{ title: "Onboarding — Admin" }] }),
  component: AdminOnboarding,
});

function AdminOnboarding() {
  const qc = useQueryClient();
  const statsFn = useServerFn(getOnboardingStats);
  const listFn = useServerFn(adminListOnboardingUsers);
  const resetFn = useServerFn(adminResetOnboarding);
  const setEnabledFn = useServerFn(adminSetOnboardingEnabled);
  const setGlobalFn = useServerFn(adminSetGlobalOnboarding);
  const statusFn = useServerFn(getOnboardingStatus);

  const [search, setSearch] = useState("");

  const stats = useQuery({ queryKey: ["onboarding-stats"], queryFn: () => statsFn({}) });
  const users = useQuery({
    queryKey: ["onboarding-users", search],
    queryFn: () => listFn({ data: { search, limit: 100 } }),
  });
  const status = useQuery({ queryKey: ["onboarding-status-admin"], queryFn: () => statusFn({}) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["onboarding-stats"] });
    qc.invalidateQueries({ queryKey: ["onboarding-users"] });
    qc.invalidateQueries({ queryKey: ["onboarding-status-admin"] });
  };

  const onToggleGlobal = async (enabled: boolean) => {
    try {
      await setGlobalFn({ data: { enabled } });
      toast.success(`Onboarding ${enabled ? "enabled" : "disabled"} globally`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const onReset = async (userId: string) => {
    try {
      await resetFn({ data: { userId } });
      toast.success("Onboarding reset");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const onToggleUser = async (userId: string, enabled: boolean) => {
    try {
      await setEnabledFn({ data: { userId, enabled } });
      toast.success(`Onboarding ${enabled ? "enabled" : "disabled"} for user`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Onboarding</h1>
          <p className="text-sm text-muted-foreground">Control the first-time user tour and view completion analytics.</p>
        </div>
      </div>

      {/* Global toggle */}
      <Card className="p-4 flex items-center justify-between gap-4">
        <div>
          <div className="font-medium">Onboarding enabled globally</div>
          <div className="text-xs text-muted-foreground">
            When off, no user sees the welcome modal or guided tours.
          </div>
        </div>
        <Switch
          checked={status.data?.globalEnabled ?? true}
          onCheckedChange={onToggleGlobal}
          disabled={status.isLoading}
        />
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total users" value={stats.data?.total_users ?? "—"} />
        <StatCard label="Completed" value={stats.data?.completed ?? "—"} icon={<CheckCircle2 className="h-4 w-4 text-success" />} />
        <StatCard label="Skipped" value={stats.data?.skipped ?? "—"} icon={<XCircle className="h-4 w-4 text-muted-foreground" />} />
        <StatCard
          label="Completion rate"
          value={stats.data ? `${stats.data.completion_rate}%` : "—"}
        />
      </div>

      {/* Per-tour breakdown */}
      <Card className="p-4">
        <div className="font-semibold mb-3">Completions per tour</div>
        {stats.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(stats.data?.per_tour_completed ?? {}).length === 0 && (
              <div className="text-sm text-muted-foreground col-span-full">No completions yet.</div>
            )}
            {Object.entries(stats.data?.per_tour_completed ?? {}).map(([k, v]) => (
              <div key={k} className="rounded-md border p-2 text-sm flex items-center justify-between">
                <span className="capitalize">{k.replace(/_/g, " ")}</span>
                <span className="font-semibold tabular-nums">{v}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Per-user table */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by display name or reference"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Tours completed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.isLoading ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : (
                (users.data ?? []).map((u) => {
                  const tourCount = Object.values(u.tour_progress ?? {}).filter(Boolean).length;
                  const statusLabel = u.onboarding_completed_at
                    ? { label: "Completed", icon: <CheckCircle2 className="h-3.5 w-3.5 text-success" /> }
                    : u.onboarding_skipped_at
                      ? { label: "Skipped", icon: <XCircle className="h-3.5 w-3.5 text-muted-foreground" /> }
                      : { label: "Pending", icon: <Clock className="h-3.5 w-3.5 text-warning" /> };
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="font-medium">{u.display_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{u.public_reference ?? u.id.slice(0, 8)}</div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          {statusLabel.icon}
                          {statusLabel.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={u.onboarding_enabled}
                          onCheckedChange={(v) => onToggleUser(u.id, v)}
                        />
                      </TableCell>
                      <TableCell className="tabular-nums">{tourCount}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onReset(u.id)}>
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reset
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: any; icon?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </Card>
  );
}
