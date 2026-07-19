import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { SVGProps } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Pencil, Trash2, Check, X, Flag } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { editPendingBetStake, cancelPendingBet } from "@/lib/bet-edit.functions";
import { editPendingUfcBetStake, cancelPendingUfcBet } from "@/lib/ufc-bet-edit.functions";
import { settleFinishedPending } from "@/lib/settle-catchup.functions";
import { flagPredictionForReview } from "@/lib/predictions-flag.functions";
import { toast } from "sonner";
import { PageShell, StencilPanel } from "@/components/ui/page-shell";
import { teamFlagUrl } from "@/lib/country-flags";

export const Route = createFileRoute("/_authenticated/my-predictions")({
  head: () => ({ meta: [{ title: "Picks — CSSEBets" }] }),
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

  const { data: ufcBets } = useQuery({
    queryKey: ["my-ufc-bets", uid],
    enabled: !!uid,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ufc_bets")
        .select("*, ufc_fights(fighter_a, fighter_b, commence_time, status, apimma_fighter_a_id, apimma_fighter_b_id, fighter_a_logo, fighter_b_logo)")
        .eq("user_id", uid!)
        .order("placed_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const ids = Array.from(new Set(
        rows.flatMap((b) => [b.ufc_fights?.apimma_fighter_a_id, b.ufc_fights?.apimma_fighter_b_id]).filter(Boolean)
      )) as number[];
      let photoBy = new Map<number, string>();
      if (ids.length) {
        const { data: fighters } = await supabase
          .from("ufc_fighters")
          .select("apimma_id, photo_url")
          .in("apimma_id", ids);
        for (const f of (fighters ?? []) as any[]) {
          if (f?.apimma_id && f.photo_url) photoBy.set(f.apimma_id, f.photo_url);
        }
      }
      return rows.map((b) => ({
        ...b,
        _photo_a: b.ufc_fights?.fighter_a_logo || photoBy.get(b.ufc_fights?.apimma_fighter_a_id) || null,
        _photo_b: b.ufc_fights?.fighter_b_logo || photoBy.get(b.ufc_fights?.apimma_fighter_b_id) || null,
      }));
    },
  });


  const { data: f1Bets } = useQuery({
    queryKey: ["my-f1-bets", uid],
    enabled: !!uid,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("f1_bets")
        .select("*, f1_races(name, country, starts_at, status, season)")
        .eq("user_id", uid!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: f1ChampBets } = useQuery({
    queryKey: ["my-f1-champ-bets", uid],
    enabled: !!uid,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("f1_championship_bets")
        .select("*")
        .eq("user_id", uid!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
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
      .on("postgres_changes", { event: "*", schema: "public", table: "ufc_bets", filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-ufc-bets", uid] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "f1_bets", filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-f1-bets", uid] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "f1_championship_bets", filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-f1-champ-bets", uid] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, uid]);

  const hasAny = (data?.length ?? 0) + (ufcBets?.length ?? 0) + (f1Bets?.length ?? 0) + (f1ChampBets?.length ?? 0) > 0;


  return (
    <PageShell kicker="FIFA WORLD CUP · 2026" title="Your" titleAccent="Picks">
      {isLoading ? (
        <StencilPanel>
          <div className="grid place-items-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-neon)]" />
          </div>
        </StencilPanel>
      ) : !hasAny ? (
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
          {(f1Bets ?? []).map((b) => <F1BetRow key={b.id} b={b} />)}
          {(f1ChampBets ?? []).map((b) => <F1ChampBetRow key={b.id} b={b} />)}
          {(ufcBets ?? []).map((b) => <UfcBetRow key={b.id} b={b} />)}
          {(data ?? []).map((p) => <PredictionRow key={p.id} p={p} />)}
        </div>

      )}
    </PageShell>

  );
}

function PredictionRow({ p }: { p: any }) {
  const qc = useQueryClient();
  const editFn = useServerFn(editPendingBetStake);
  const cancelFn = useServerFn(cancelPendingBet);
  const flagFn = useServerFn(flagPredictionForReview);
  const [editing, setEditing] = useState(false);
  const [stake, setStake] = useState(String(p.virtual_stake));
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState("");

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

  const flagMut = useMutation({
    mutationFn: async () => flagFn({ data: { predictionId: p.id, reason: flagReason.trim() } }),
    onSuccess: () => {
      toast.success("Bet flagged for admin review");
      setFlagOpen(false);
      setFlagReason("");
      qc.invalidateQueries({ queryKey: ["my-predictions"] });
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
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className={`border px-2 py-1 text-[10px] uppercase tracking-[0.22em] font-bold ${statusTone}`}>
              {p.status}
            </div>
            {p.free_bet_id ? (
              <div className="border border-[var(--color-neon)] bg-[var(--color-neon)]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--color-neon)]">
                Free Bet
              </div>
            ) : null}
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
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon)]">
              {p.free_bet_id ? "Wins Pay" : "Potential"}
            </div>
            <div className="font-mono font-bold text-[var(--color-neon)] text-lg leading-tight tabular-nums">
              {p.free_bet_id ? `+${profit}` : payout}
            </div>
            <div className="text-[10px] text-[var(--color-ink-muted)] tabular-nums">
              {p.free_bet_id ? "profit only · stake returns to house" : `+${profit} profit`}
            </div>
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
            <div className="flex items-center gap-2">
              {p.flagged_for_review ? (
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-yellow-500">
                  Flagged · under review
                </span>
              ) : (
                <>
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-ink-muted)]">
                    Settled
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[10px]"
                    onClick={() => setFlagOpen((v) => !v)}
                    title="Flag this bet for admin review"
                  >
                    <Flag className="h-3 w-3 mr-1" /> Flag
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        {flagOpen && !p.flagged_for_review && (
          <div className="border-t border-dashed border-[var(--color-surface-border)] pt-3 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              Why does this settlement look wrong?
            </div>
            <Input
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="e.g. official stats show 5 corners for each team"
              className="h-8 text-xs"
              maxLength={500}
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" className="h-8" onClick={() => { setFlagOpen(false); setFlagReason(""); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8"
                disabled={flagMut.isPending || flagReason.trim().length < 3}
                onClick={() => flagMut.mutate()}
              >
                Submit flag
              </Button>
            </div>
          </div>
        )}

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

function FighterPhoto({ url, name }: { url: string | null; name: string }) {
  if (!url) {
    return (
      <div className="grid h-14 w-14 place-items-center rounded-full border border-border/40 bg-[var(--color-surface)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink)] shadow-sm">
        {name.slice(0, 2)}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`${name} photo`}
      className="h-14 w-14 shrink-0 rounded-full border border-border/40 object-cover shadow-sm"
      loading="lazy"
    />
  );
}

function UfcBetRow({ b }: { b: any }) {
  const qc = useQueryClient();
  const editFn = useServerFn(editPendingUfcBetStake);
  const cancelFn = useServerFn(cancelPendingUfcBet);
  const [editing, setEditing] = useState(false);
  const [stake, setStake] = useState(String(b.stake));

  const stakeN = Number(b.stake);
  const oddsN = Number(b.odds_locked);
  const payout = Number(b.potential_payout ?? stakeN * oddsN).toFixed(2);
  const profit = (stakeN * oddsN - stakeN).toFixed(2);
  const ticketId = String(b.id).replace(/-/g, "").slice(0, 10).toUpperCase();
  const commenceMs = b.ufc_fights?.commence_time ? new Date(b.ufc_fights.commence_time).getTime() : null;
  const commence = commenceMs
    ? new Date(commenceMs).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
  const status = b.status ?? "pending";
  const fightLocked = commenceMs !== null
    ? commenceMs <= Date.now() || (b.ufc_fights?.status && b.ufc_fights.status !== "scheduled")
    : false;
  const canModify = status === "open" && !fightLocked;
  const statusTone =
    status === "won" ? "text-[var(--color-neon)] border-[var(--color-neon)]/60 bg-[var(--color-neon)]/10"
    : status === "lost" ? "text-destructive border-destructive/60 bg-destructive/10"
    : "text-[var(--color-ink-muted)] border-[var(--color-surface-border)] bg-[var(--color-surface)]/40";
  const marketLabel = String(b.market_type ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const editMut = useMutation({
    mutationFn: async (newStake: number) => editFn({ data: { betId: b.id, newStake } }),
    onSuccess: () => {
      toast.success("Bet updated");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["my-ufc-bets"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: async () => cancelFn({ data: { betId: b.id } }),
    onSuccess: () => {
      toast.success("Bet cancelled — stake refunded");
      qc.invalidateQueries({ queryKey: ["my-ufc-bets"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stakeNum = Number(stake);
  const stakeInvalid = !Number.isFinite(stakeNum) || stakeNum < MIN_STAKE || stakeNum > MAX_STAKE;
  const stakeUnchanged = stakeNum === Number(b.stake);
  const displayStatus = status === "open" ? "pending" : status;

  return (
    <StencilPanel
      accent={status === "won"}
      kicker={<><span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-neon)] animate-pulse" /> UFC Ticket</>}
      meta={`#${ticketId}`}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)] mb-2">Fight</div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="flex flex-col items-center gap-1.5">
                <FighterPhoto url={b._photo_a} name={b.ufc_fights?.fighter_a ?? ""} />
                <span className="max-w-[110px] truncate text-center text-[10px] font-bold uppercase tracking-wide">
                  {b.ufc_fights?.fighter_a ?? "—"}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="font-display text-xs font-bold leading-none text-[var(--color-ink-muted)]">vs</span>
                <span className="h-4 w-px bg-[var(--color-neon)]/40" />
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <FighterPhoto url={b._photo_b} name={b.ufc_fights?.fighter_b ?? ""} />
                <span className="max-w-[110px] truncate text-center text-[10px] font-bold uppercase tracking-wide">
                  {b.ufc_fights?.fighter_b ?? "—"}
                </span>
              </div>
            </div>
            <div className="text-[11px] text-[var(--color-ink-muted)] mt-2">{commence}</div>
          </div>
          <div className={`shrink-0 border px-2 py-1 text-[10px] uppercase tracking-[0.22em] font-bold ${statusTone}`}>
            {displayStatus}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="border border-dashed border-[var(--color-surface-border)] px-2.5 py-1.5">
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">Market</div>
            <div className="font-medium truncate">{marketLabel}</div>
          </div>
          <div className="border border-dashed border-[var(--color-surface-border)] px-2.5 py-1.5">
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">Selection</div>
            <div className="font-medium truncate">{b.selection_label ?? b.selection_key}</div>
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
            UFC · {marketLabel}
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
                    onClick={() => { setEditing(false); setStake(String(b.stake)); }}
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
          ) : status === "open" && fightLocked ? (
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-ink-muted)]">
              Locked · started
            </div>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-ink-muted)]">
              Settled
            </span>
          )}
        </div>
      </div>
    </StencilPanel>
  );
}

