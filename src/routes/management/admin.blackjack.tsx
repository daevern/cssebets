import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useHasSession } from "@/hooks/use-staff-session";
import {
  adminBlackjackOverview,
  adminGetBlackjackConfig,
  adminListBlackjackHands,
  adminPublishBlackjackRules,
  adminResolveBlackjackHand,
} from "@/lib/arcade/blackjack-admin.functions";
import {
  MgmtBtn,
  MgmtKpi,
  MgmtPageHeader,
  MgmtPanel,
  MgmtStatus,
  MgmtTable,
  MgmtTd,
  MgmtTh,
} from "@/components/management/ops-ui";

export const Route = createFileRoute("/management/admin/blackjack")({
  head: () => ({ meta: [{ title: "Blackjack desk — CSSEBets Operator" }] }),
  component: AdminBlackjackPage,
});

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
      <MgmtPageHeader
        eyebrow="Casino floor"
        title="Blackjack desk"
        description="Table kill-switch, stake rules, hand voiding and abnormal win-rate review."
      />

      {overview.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-[var(--mgmt-accent)]" />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <MgmtKpi label="Hands 7d" value={(overview.data?.hands7d ?? 0).toLocaleString()} />
          <MgmtKpi label="Settled 7d" value={(overview.data?.completed7d ?? 0).toLocaleString()} />
          <MgmtKpi label="Players 7d" value={(overview.data?.players7d ?? 0).toLocaleString()} />
          <MgmtKpi label="Win rate" value={`${overview.data?.winRate7d ?? 0}%`} />
          <MgmtKpi label="Score 7d" value={(overview.data?.score7d ?? 0).toLocaleString()} />
        </div>
      )}

      <MgmtPanel
        title="Table controls"
        description={`Rule version ${rules?.version ?? "—"} · stakes ${rules?.min_stake ?? "—"}–${rules?.max_stake ?? "—"} pts · limit ${rules?.daily_hand_limit ?? "—"} hands/day`}
        actions={
          <div className="flex items-center gap-2">
            <MgmtStatus tone={rules?.maintenance_mode ? "warn" : "ok"}>
              {rules?.maintenance_mode ? "Paused" : "Live"}
            </MgmtStatus>
            <MgmtBtn
              variant={rules?.maintenance_mode ? "primary" : "danger"}
              disabled={maintenance.isPending || !rules}
              onClick={() => maintenance.mutate(!rules?.maintenance_mode)}
            >
              {rules?.maintenance_mode ? "Resume table" : "Pause table"}
            </MgmtBtn>
          </div>
        }
      >
        <p className="text-[12px] text-[var(--mgmt-muted)]">
          Pausing publishes a new rule version with maintenance_mode on. All changes are audited.
        </p>
      </MgmtPanel>

      {!!overview.data?.top?.some((t: any) => t.suspicious) && (
        <MgmtPanel title="Abnormal win rates">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-[var(--mgmt-warn)]">
            <ShieldAlert className="h-4 w-4" /> Review these players
          </div>
          <ul className="space-y-1 font-mono text-[12px] text-[var(--mgmt-ink)]">
            {overview.data.top
              .filter((t: any) => t.suspicious)
              .map((t: any) => (
                <li key={t.user_id}>
                  {t.user_id.slice(0, 8)}… · {t.hands} hands · {t.winRate}% win rate
                </li>
              ))}
          </ul>
        </MgmtPanel>
      )}

      <MgmtPanel
        title="Recent hands"
        actions={
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required to void)"
            className="h-8 max-w-xs border-[var(--mgmt-border)] bg-[var(--mgmt-bg)] text-xs"
          />
        }
      >
        <MgmtTable minWidth="720px">
          <thead>
            <tr>
              <MgmtTh>Player</MgmtTh>
              <MgmtTh>Status</MgmtTh>
              <MgmtTh>Result</MgmtTh>
              <MgmtTh>Dealer</MgmtTh>
              <MgmtTh>Score</MgmtTh>
              <MgmtTh>When</MgmtTh>
              <MgmtTh>{""}</MgmtTh>
            </tr>
          </thead>
          <tbody>
            {(hands.data?.rows ?? []).map((h: any) => (
              <tr key={h.id}>
                <MgmtTd>{h.username ?? h.user_id.slice(0, 8)}</MgmtTd>
                <MgmtTd>{h.status}</MgmtTd>
                <MgmtTd>{h.result ?? "—"}</MgmtTd>
                <MgmtTd mono>{h.dealer_total ?? "—"}</MgmtTd>
                <MgmtTd mono>{h.total_score_awarded}</MgmtTd>
                <MgmtTd className="text-[var(--mgmt-muted)]">
                  {new Date(h.created_at).toLocaleString()}
                </MgmtTd>
                <MgmtTd className="text-right">
                  {h.status !== "VOID" && h.status !== "REVERSED" && (
                    <MgmtBtn
                      variant="danger"
                      disabled={reason.trim().length < 4 || resolve.isPending}
                      onClick={() => resolve.mutate(h.id)}
                    >
                      Void
                    </MgmtBtn>
                  )}
                </MgmtTd>
              </tr>
            ))}
            {!hands.isLoading && !(hands.data?.rows ?? []).length && (
              <tr>
                <MgmtTd className="text-[var(--mgmt-muted)]">No hands played yet.</MgmtTd>
              </tr>
            )}
          </tbody>
        </MgmtTable>
      </MgmtPanel>
    </div>
  );
}
