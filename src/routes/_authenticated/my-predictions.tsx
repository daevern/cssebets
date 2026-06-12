import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium truncate">
            {p.matches ? `${p.matches.home_team} vs ${p.matches.away_team}` : "—"}
          </div>
          <div className="text-xs text-muted-foreground">
            {p.market_text ?? p.market} · {p.selection_label ?? p.outcome} · stake {p.virtual_stake} @ {p.reference_odds}
          </div>
        </div>
        <div className="text-right space-y-1 shrink-0">
          <Badge variant={p.status === "won" ? "default" : p.status === "lost" ? "destructive" : "secondary"}>
            {p.status}
          </Badge>
          <div className="text-xs text-muted-foreground">{p.points ?? 0} pts</div>
        </div>
      </div>

      {canModify && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/40">
          {editing ? (
            <>
              <Input
                type="number"
                min={MIN_STAKE}
                max={MAX_STAKE}
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                className="h-9 w-32"
                placeholder={`${MIN_STAKE}-${MAX_STAKE}`}
              />
              <Button
                size="sm"
                disabled={editMut.isPending || stakeInvalid || stakeUnchanged}
                onClick={() => editMut.mutate(stakeNum)}
              >
                <Check className="h-4 w-4 mr-1" /> Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={editMut.isPending}
                onClick={() => { setEditing(false); setStake(String(p.virtual_stake)); }}
              >
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              {stakeInvalid && (
                <span className="text-xs text-destructive">Stake must be {MIN_STAKE}-{MAX_STAKE.toLocaleString()}.</span>
              )}
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4 mr-1" /> Edit stake
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={cancelMut.isPending}
                onClick={() => {
                  if (window.confirm("Cancel this bet and refund the stake?")) cancelMut.mutate();
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Remove bet
              </Button>
            </>
          )}
        </div>
      )}

      {!canModify && p.status === "pending" && matchLocked && (
        <div className="text-xs text-muted-foreground pt-1 border-t border-border/40">
          Match has kicked off — edit/remove disabled.
        </div>
      )}
    </Card>
  );
}
