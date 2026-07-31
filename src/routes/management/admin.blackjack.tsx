import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldAlert, Spade } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHasSession } from "@/hooks/use-staff-session";
import {
  adminBlackjackOverview,
  adminGetBlackjackConfig,
  adminListBlackjackHands,
  adminPublishBlackjackRules,
  adminResolveBlackjackHand,
} from "@/lib/arcade/blackjack-admin.functions";

export const Route = createFileRoute("/management/admin/blackjack")({
  head: () => ({ meta: [{ title: "Blackjack — Admin | cssebets" }] }),
  component: AdminBlackjackPage;
});

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-3 py-2">
      <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
        {label}
      </div>
      <div className="font-mono text-lg font-bold tabular-nums text-[var(--color-ink)]">{value}</div>
    </div>
  );
}

function AdminBlackjackPage() {
  const hasSession = useHasSession();
  const qc = useQueryClient();
  const overviewFn = useServerFn(adminBlackjackOverview);
  const handsFn = useServerFn(adminListBlackjackHands);
  const configFn = useServerFn(adminGetBlackjackConfig);
  const resolveFn = useServerFn(adminResolveBlackjackHand);
  const publishFn = useServerFn(adminPublishBlackjackRules);

  const enabled = hasSession === true;
  const overview = useQuery({ queryKey: ["bj-admin", "overview"], queryFn: () => overviewFn(), enabled });
  const hands = useQuery({
    queryKey: ["bj-admin", "hands"],
    queryFn: () => handsFn({ data: { page: 0, pageSize: 25, status: "ALL" } }),
    enabled,
  });
  const config = useQuery({ queryKey: ["bj-admin", "config"], queryFn: () => configFn(), enabled });

  const [reason, setReason] = useState("");

  const resolve = useMutation({
    mutationFn: (handId: string) =>
      resolveFn({ data: { handId, action: "VOID" as const, reason: reason.trim() } }),
    onSuccess: () => {
      toast.success("Hand voided");
      setReason("");
      qc.invalidateQueries({ queryKey: ["bj-admin"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not resolve the hand."),
  });

  const maintenance = useMutation({
    mutationFn: (on: boolean) =>
      publishFn({
        data: {
          patch: { maintenance_mode: on },
          reason: on ? "Enable blackjack maintenance" : "Disable blackjack maintenance",
        },
      }),
    onSuccess: () => {
      toast.success("Rules published");
      qc.invalidateQueries({ queryKey: ["bj-admin", "config"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not publish rules."),
  });

  const rules = config.data?.rules as any;

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2">
        <Spade className="h-5 w-5 text-[var(--color-neon)]" />
        <div>
          <h1 className="font-display text-lg font-bold">Blackjack</h1>
          <p className="text-xs text-[var(--color-ink-muted)]">
            Free-play arcade game. No wallet, points or payouts are involved — score only.
          </p>
        </div>
      </header>

      {overview.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-[var(--color-neon)]" />
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Card label="Hands 7d" value={(overview.data?.hands7d ?? 0).toLocaleString()} />
          <Card label="Settled 7d" value={(overview.data?.completed7d ?? 0).toLocaleString()} />
          <Card label="Players 7d" value={(overview.data?.players7d ?? 0).toLocaleString()} />
          <Card label="Win rate" value={`${overview.data?.winRate7d ?? 0}%`} />
          <Card label="Score 7d" value={(overview.data?.score7d ?? 0).toLocaleString()} />
        </div>
      )}

      <section className="border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
              Maintenance mode
            </div>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Rule version {rules?.version ?? "—"} · {rules?.daily_entry_allocation ?? "—"} free hands/day ·
              limit {rules?.daily_hand_limit ?? "—"}/day
            </p>
          </div>
          <Button
            variant="outline"
            disabled={maintenance.isPending || !rules}
            onClick={() => maintenance.mutate(!rules?.maintenance_mode)}
          >
            {rules?.maintenance_mode ? "Resume game" : "Pause game"}
          </Button>
        </div>
      </section>

      {!!overview.data?.top?.some((t: any) => t.suspicious) && (
        <section className="border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">
            <ShieldAlert className="h-4 w-4" /> Abnormal win rates
          </div>
          <ul className="mt-2 space-y-1 text-xs text-amber-200">
            {overview.data.top
              .filter((t: any) => t.suspicious)
              .map((t: any) => (
                <li key={t.user_id} className="font-mono">
                  {t.user_id.slice(0, 8)}… · {t.hands} hands · {t.winRate}% win rate
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
            Recent hands
          </h2>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required to void)"
            className="h-8 max-w-xs text-xs"
          />
        </div>

        <div className="overflow-x-auto border border-[var(--color-surface-border)]">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-[var(--color-surface-2)] text-[9px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Result</th>
                <th className="px-3 py-2">Dealer</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(hands.data?.rows ?? []).map((h: any) => (
                <tr key={h.id} className="border-t border-[var(--color-surface-border)]">
                  <td className="px-3 py-2">{h.username ?? h.user_id.slice(0, 8)}</td>
                  <td className="px-3 py-2">{h.status}</td>
                  <td className="px-3 py-2">{h.result ?? "—"}</td>
                  <td className="px-3 py-2 font-mono tabular-nums">{h.dealer_total ?? "—"}</td>
                  <td className="px-3 py-2 font-mono tabular-nums">{h.total_score_awarded}</td>
                  <td className="px-3 py-2 text-[var(--color-ink-muted)]">
                    {new Date(h.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {h.status !== "VOID" && h.status !== "REVERSED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reason.trim().length < 4 || resolve.isPending}
                        onClick={() => resolve.mutate(h.id)}
                      >
                        Void
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!hands.isLoading && !(hands.data?.rows ?? []).length && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[var(--color-ink-muted)]">
                    No hands played yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
