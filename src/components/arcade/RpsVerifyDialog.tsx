import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import { revealRpsRound } from "@/lib/arcade/rps.functions";
import {
  hmacSha256,
  moveFromDigest,
  rpsGrossReturn,
  rpsHmacInput,
  rpsOutcome,
  sha256Hex,
  toHex,
} from "@/lib/arcade/rps-math";

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean | null }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--color-surface-border)] py-1.5 last:border-0">
      <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
        {label}
      </span>
      <span className="flex items-center gap-1.5 break-all text-right font-mono text-[10px] text-[var(--color-ink)]">
        {value}
        {ok === true && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-neon)]" />}
        {ok === false && <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />}
      </span>
    </div>
  );
}

/**
 * Independent, browser-side verification of a settled RPS round.
 *
 * Recomputes SHA-256(server_seed) against the hash that was published BEFORE
 * the player chose, then re-derives the computer's move from
 * HMAC-SHA256(server_seed, "clientSeed:nonce:roundId") and re-checks the
 * payout. Nothing here trusts the server's stated outcome.
 */
export function RpsVerifyDialog({
  open,
  onOpenChange,
  roundId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roundId: string | null;
}) {
  const revealFn = useServerFn(revealRpsRound);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [hashOk, setHashOk] = useState<boolean | null>(null);
  const [moveOk, setMoveOk] = useState<boolean | null>(null);
  const [payoutOk, setPayoutOk] = useState<boolean | null>(null);
  const [computedMove, setComputedMove] = useState<string | null>(null);
  const [computedHex, setComputedHex] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !roundId) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setData(null);
    setHashOk(null);
    setMoveOk(null);
    setPayoutOk(null);

    (async () => {
      try {
        const res: any = await revealFn({ data: { roundId } });
        if (cancelled) return;
        setData(res);

        const round = res.round;
        const seed: string = res.serverSeed;

        const hash = await sha256Hex(seed);
        const digest = await hmacSha256(
          seed,
          rpsHmacInput(round.clientSeed ?? "", round.nonce, round.id),
        );
        const move = moveFromDigest(digest);
        const outcome = rpsOutcome(round.playerChoice, move);
        const expectedReturn = rpsGrossReturn(round.stake, round.multiplier);

        if (cancelled) return;
        setHashOk(hash === round.serverSeedHash);
        setComputedHex(toHex(digest));
        setComputedMove(move);
        setMoveOk(move === round.serverChoice && outcome === round.outcome);
        setPayoutOk(Math.abs(expectedReturn - round.grossReturn) < 0.005);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Could not load this round.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, roundId, revealFn]);

  const round = data?.round;
  const allOk = hashOk === true && moveOk === true && payoutOk === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em]">
            <ShieldCheck className="h-4 w-4 text-[var(--color-neon)]" /> Verify round
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--color-neon)]" />
          </div>
        )}

        {error && <p className="py-4 text-center text-xs text-red-400">{error}</p>}

        {round && !loading && (
          <div className="space-y-3">
            <div
              className={`rounded-[4px] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] ${
                allOk
                  ? "bg-[var(--color-neon)]/15 text-[var(--color-neon)]"
                  : "bg-red-500/15 text-red-400"
              }`}
            >
              {allOk ? "Verified — result matches the commitment" : "Mismatch detected"}
            </div>

            <div className="rounded-[4px] bg-[var(--color-surface-2)] px-3 py-1">
              <Row label="Round" value={round.verificationId ?? round.id} />
              <Row label="Committed hash" value={round.serverSeedHash} ok={hashOk} />
              <Row label="Server seed" value={data.serverSeed} />
              <Row label="Client seed" value={round.clientSeed ?? "—"} />
              <Row label="Nonce" value={String(round.nonce)} />
              <Row label="HMAC input" value={round.hmacInput ?? "—"} />
              <Row label="Digest" value={(computedHex ?? "").slice(0, 32) + "…"} />
              <Row
                label="Your move"
                value={String(round.playerChoice)}
              />
              <Row
                label="Computer move"
                value={`${round.serverChoice}${computedMove && computedMove !== round.serverChoice ? ` (got ${computedMove})` : ""}`}
                ok={moveOk}
              />
              <Row label="Outcome" value={String(round.outcome)} />
              <Row
                label="Payout"
                value={`${round.stake} × ${Number(round.multiplier).toFixed(2)} = ${Number(round.grossReturn).toFixed(2)}`}
                ok={payoutOk}
              />
            </div>

            <p className="text-[10px] leading-relaxed text-[var(--color-ink-muted)]">
              The hash above was published before you chose. Your browser hashed the revealed seed
              and re-derived the computer's move from{" "}
              <span className="font-mono">HMAC-SHA256(seed, clientSeed:nonce:roundId)</span> — no
              server response was trusted.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
