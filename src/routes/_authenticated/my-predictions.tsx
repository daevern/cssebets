import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { SVGProps } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Pencil, Trash2, Check, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { editPendingBetStake, cancelPendingBet } from "@/lib/bet-edit.functions";
import { settleFinishedPending } from "@/lib/settle-catchup.functions";
import { toast } from "sonner";
import { PageShell, StencilPanel } from "@/components/ui/page-shell";
import { teamFlagUrl } from "@/lib/country-flags";

export const Route = createFileRoute("/_authenticated/my-predictions")({
  head: () => ({ meta: [{ title: "Activity — CSSEBets" }] }),
  component: MyPredictionsPage,
});

const MIN_STAKE = 10;
const MAX_STAKE = 50000;

function TicketIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 200 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-full max-w-[180px] h-auto mx-auto text-[var(--color-neon)] opacity-90 drop-shadow-[0_0_8px_rgba(var(--color-neon-glow-rgb),0.3)]"
      {...props}
    >
      <path d="M 20 30 L 180 30 L 180 50 A 10 10 0 0 0 180 70 L 180 90 L 20 90 L 20 70 A 10 10 0 0 0 20 50 Z" />
      <line x1="100" y1="35" x2="100" y2="45" strokeDasharray="2,3" />
      <line x1="100" y1="50" x2="100" y2="60" strokeDasharray="2,3" />
      <line x1="100" y1="65" x2="100" y2="75" strokeDasharray="2,3" />
      <line x1="100" y1="80" x2="100" y2="85" strokeDasharray="2,3" />
      <line x1="35" y1="50" x2="85" y2="50" />
      <line x1="35" y1="60" x2="75" y2="60" />
      <line x1="35" y1="70" x2="85" y2="70" />
      <circle cx="140" cy="60" r="12" />
      <path d="M 134 60 L 138 64 L 146 56" />
    </svg>
  );
}

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

  return (
    <PageShell kicker="FIFA WORLD CUP · 2026" title="YOUR" titleAccent="PICKS">
      {isLoading ? (
        <StencilPanel>
          <div className="grid place-items-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-neon)]" />
          </div>
        </StencilPanel>
      ) : !data?.length ? (
        <StencilPanel accent>
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <TicketIcon />
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              No tickets in play.
            </p>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Head to MATCHES and back a read to start your slate.
            </p>
          </div>
        </StencilPanel>
      ) : (
        <div className="space-y-3">
          {data.map((p) => <PredictionRow key={p.id} p={p} />)}
        </div>
      )}
    </PageShell>
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
    p.status === "won" ? "text-[var(--color-neon)] border-[var(--color-neon)]/60 bg-[var(--color-neon)]/10"
    : p.status === "lost" ? "text-destructive border-destructive/60 bg-destructive/10"
    : "text-[var(--color-ink-muted)] border-[var(--color-surface-border)] bg-[var(--color-surface)]/40";

  return (
    <StencilPanel
      accent={p.status === "won"}
      kicker={<><span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-neon)] animate-pulse" /> Match Ticket</>}
      meta={`#${ticketId}`}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)] mb-2">Fixture</div>
            {p.matches ? (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="flex flex-col items-center gap-1.5">
                  <TeamFlag name={p.matches.home_team} />
                  <span className="max-w-[90px] truncate text-center text-[10px] font-bold uppercase tracking-wide">
                    {p.matches.home_team}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="font-display text-xs font-bold leading-none text-[var(--color-ink-muted)]">vs</span>
                  <span className="h-4 w-px bg-[var(--color-neon)]/40" />
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <TeamFlag name={p.matches.away_team} />
                  <span className="max-w-[90px] truncate text-center text-[10px] font-bold uppercase tracking-wide">
                    {p.matches.away_team}
                  </span>
                </div>
              </div>
            ) : (
              <div className="font-display font-bold text-base leading-tight">—</div>
            )}
            <div className="text-[11px] text-[var(--color-ink-muted)] mt-2">{kickoffLabel}</div>
          </div>
          <div className={`shrink-0 border px-2 py-1 text-[10px] uppercase tracking-[0.22em] font-bold ${statusTone}`}>
            {p.status}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="border border-dashed border-[var(--color-surface-border)] px-2.5 py-1.5">
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">Market</div>
            <div className="font-medium truncate">{p.market_text ?? p.market}</div>
          </div>
          <div className="border border-dashed border-[var(--color-surface-border)] px-2.5 py-1.5">
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">Selection</div>
            <div className="font-medium truncate">{p.selection_label ?? p.outcome}</div>
          </div>
        </div>

        <div className="border-t border-dashed border-[var(--color-surface-border)]" />

        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">Stake</div>
            <div className="font-mono font-semibold tabular-nums">{stakeN.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">Odds</div>
            <div className="font-mono font-semibold tabular-nums">{oddsN.toFixed(2)}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon)]">Potential</div>
            <div className="font-mono font-bold text-[var(--color-neon)] text-lg leading-tight tabular-nums">{payout}</div>
            <div className="text-[10px] text-[var(--color-ink-muted)] tabular-nums">+{profit} profit</div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-dashed border-[var(--color-surface-border)] pt-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
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
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-ink-muted)]">
              Locked · kicked off
            </div>
          ) : (
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-ink-muted)]">
              Settled
            </div>
          )}
        </div>
      </div>
    </StencilPanel>
  );
}

function TeamFlag({ name }: { name: string }) {
  const url = teamFlagUrl(name, 160);
  if (!url) {
    return (
      <div className="grid h-9 w-14 place-items-center border border-border/40 bg-[var(--color-surface)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink)] shadow-sm">
        {name.slice(0, 3)}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`${name} flag`}
      className="h-9 w-14 shrink-0 border border-border/40 object-cover shadow-sm"
      loading="lazy"
    />
  );
}
