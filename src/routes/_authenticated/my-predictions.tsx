import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Pencil, Trash2, Check, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { editPendingBetStake, cancelPendingBet } from "@/lib/bet-edit.functions";
import { settleFinishedPending } from "@/lib/settle-catchup.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/my-predictions")({
  head: () => ({ meta: [{ title: "PICKS — cssebets" }] }),
  component: MyPredictionsPage,
});

const MIN_STAKE = 10;
const MAX_STAKE = 50000;

function MyPredictionsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = user?.id;
  const { data, isLoading } = useQuery({
    queryKey: ["my-predictions", uid],
    enabled: !!uid,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("*, matches(home_team, away_team, kickoff_at, status)")
        .eq("user_id", uid!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const settleFn = useServerFn(settleFinishedPending);

  // Auto-settle any finished matches with pending bets — on mount and every 30s.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const run = async () => {
      try {
        const r = await settleFn({});
        if (!cancelled && (r as any)?.settled > 0) {
          qc.invalidateQueries({ queryKey: ["my-predictions", uid] });
        }
      } catch { /* ignore */ }
    };
    run();
    const t = setInterval(run, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [uid, qc, settleFn]);

  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`my-predictions-live-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "predictions", filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-predictions", uid] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, uid]);

  if (isLoading) return <div className="grid place-items-center py-20"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">PICKS</h1>
      {!data?.length ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No predictions yet.</Card>
      ) : (
        <div className="space-y-2">
          {data.map((p) => <PredictionRow key={p.id} p={p} />)}
        </div>
      )}
    </div>
  );
}

function PredictionRow({ p }: { p: any }) {
  const qc = useQueryClient();
  const editFn = useServerFn(editPendingBetStake);
  const cancelFn = useServerFn(cancelPendingBet);
  const [editing, setEditing] = useState(false);
  const [stake, setStake] = useState(String(p.virtual_stake));

  const kickoff = p.matches?.kickoff_at ? new Date(p.matches.kickoff_at).getTime() : null;
  const matchLocked = kickoff !== null
    ? kickoff <= Date.now() || (p.matches?.status && p.matches.status !== "scheduled")
    : false;
  const canModify = p.status === "pending" && !matchLocked;

  const editMut = useMutation({
    mutationFn: async (newStake: number) => editFn({ data: { predictionId: p.id, newStake } }),
    onSuccess: () => {
      toast.success("Bet updated");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["my-predictions"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["my-match-pending-bets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: async () => cancelFn({ data: { predictionId: p.id } }),
    onSuccess: () => {
      toast.success("Bet cancelled — stake refunded");
      qc.invalidateQueries({ queryKey: ["my-predictions"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["my-match-pending-bets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stakeNum = Number(stake);
  const stakeInvalid = !Number.isFinite(stakeNum) || stakeNum < MIN_STAKE || stakeNum > MAX_STAKE;
  const stakeUnchanged = stakeNum === Number(p.virtual_stake);

  const stakeN = Number(p.virtual_stake);
  const oddsN = Number(p.reference_odds);
  const payout = (stakeN * oddsN).toFixed(2);
  const profit = (stakeN * oddsN - stakeN).toFixed(2);
  const ticketId = String(p.id).replace(/-/g, "").slice(0, 10).toUpperCase();
  const kickoffLabel = p.matches?.kickoff_at
    ? new Date(p.matches.kickoff_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

  const statusTone =
    p.status === "won" ? "text-primary border-primary/60 bg-primary/10"
    : p.status === "lost" ? "text-destructive border-destructive/60 bg-destructive/10"
    : "text-muted-foreground border-border bg-muted/30";

  return (
    <Card className="relative overflow-hidden p-0 border-border/60 bg-card shadow-md">
      {/* perforation notches */}
      <span aria-hidden className="absolute left-[-8px] top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-background border border-border/60" />
      <span aria-hidden className="absolute right-[-8px] top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-background border border-border/60" />

      {/* Header / stub */}
      <div className="flex items-center justify-between px-4 py-2 bg-primary/10 border-b border-primary/20">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-primary font-semibold">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          CSSEBets · Match Ticket
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          #{ticketId}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Fixture</div>
            <div className="font-semibold text-base leading-tight truncate">
              {p.matches ? (
                <>
                  {p.matches.home_team} <span className="text-muted-foreground text-xs mx-1">vs</span> {p.matches.away_team}
                </>
              ) : "—"}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{kickoffLabel}</div>
          </div>
          <div className={`shrink-0 rounded-sm border px-2 py-1 text-[10px] uppercase tracking-[0.22em] font-bold ${statusTone}`}>
            {p.status}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-sm bg-muted/30 px-2.5 py-1.5">
            <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Market</div>
            <div className="font-medium truncate">{p.market_text ?? p.market}</div>
          </div>
          <div className="rounded-sm bg-muted/30 px-2.5 py-1.5">
            <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Selection</div>
            <div className="font-medium truncate">{p.selection_label ?? p.outcome}</div>
          </div>
        </div>
      </div>

      {/* Perforated divider */}
      <div className="relative mx-4 border-t border-dashed border-border/70" />

      {/* Stub: stake / odds / payout */}
      <div className="px-4 py-3 grid grid-cols-3 gap-2">
        <div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Stake</div>
          <div className="font-mono font-semibold tabular-nums">{stakeN.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Odds</div>
          <div className="font-mono font-semibold tabular-nums">{oddsN.toFixed(2)}</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-[0.2em] text-primary">Potential payout</div>
          <div className="font-mono font-bold text-primary text-lg leading-tight tabular-nums">{payout}</div>
          <div className="text-[10px] text-muted-foreground tabular-nums">+{profit} profit</div>
        </div>
      </div>

      {/* Footer / actions */}
      <div className="px-4 py-2 border-t border-border/60 bg-muted/20 flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {p.points ?? 0} pts awarded
        </div>

        {canModify ? (
          <div className="flex flex-wrap items-center gap-1.5 justify-end">
            {editing ? (
              <>
                <Input
                  type="number"
                  min={MIN_STAKE}
                  max={MAX_STAKE}
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="h-8 w-24"
                  placeholder={`${MIN_STAKE}-${MAX_STAKE}`}
                />
                <Button
                  size="sm"
                  className="h-8"
                  disabled={editMut.isPending || stakeInvalid || stakeUnchanged}
                  onClick={() => editMut.mutate(stakeNum)}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  disabled={editMut.isPending}
                  onClick={() => { setEditing(false); setStake(String(p.virtual_stake)); }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
                {stakeInvalid && (
                  <span className="text-[10px] text-destructive w-full text-right">Stake must be {MIN_STAKE}-{MAX_STAKE.toLocaleString()}.</span>
                )}
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" className="h-8" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8"
                  disabled={cancelMut.isPending}
                  onClick={() => {
                    if (window.confirm("Cancel this bet and refund the stake?")) cancelMut.mutate();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Void
                </Button>
              </>
            )}
          </div>
        ) : p.status === "pending" && matchLocked ? (
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Locked · kicked off
          </div>
        ) : (
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Settled
          </div>
        )}
      </div>
    </Card>
  );
}
