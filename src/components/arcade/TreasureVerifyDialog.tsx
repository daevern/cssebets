import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { revealTreasureSeed } from "@/lib/arcade/treasure-phase2.functions";
import { Loader2, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacBytes(keyText: string, msg: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyText),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return new Uint8Array(sig);
}

/**
 * Mirrors arcade_treasure_generate_traps: a Fisher–Yates shuffle of tiles
 * 0..n-1 driven by 32-bit words from HMAC-SHA256(server_seed,
 * client:nonce:counter) with rejection sampling, taking the first m tiles.
 */
async function recomputeTraps(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  n: number,
  m: number,
) {
  const deck = Array.from({ length: n }, (_, i) => i);
  let block: Uint8Array | null = null;
  let offset = 32;
  let counter = 0;

  for (let i = n - 1; i > 0; i--) {
    const bound = i + 1;
    const limit = 4294967296 - (4294967296 % bound);
    let r = 0;
    for (;;) {
      if (offset > 28) {
        block = await hmacBytes(serverSeed, `${clientSeed}:${nonce}:${counter}`);
        counter += 1;
        offset = 0;
      }
      const b = block!;
      r = b[offset] * 16777216 + b[offset + 1] * 65536 + b[offset + 2] * 256 + b[offset + 3];
      offset += 4;
      if (r < limit) break;
    }
    const j = r % bound;
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck.slice(0, m);
}

export function TreasureVerifyDialog({
  open,
  onOpenChange,
  roundId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roundId: string | null;
}) {
  const revealFn = useServerFn(revealTreasureSeed);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof revealFn>> | null>(null);
  const [hashOk, setHashOk] = useState<boolean | null>(null);
  const [trapsOk, setTrapsOk] = useState<boolean | null>(null);
  const [computed, setComputed] = useState<number[] | null>(null);

  useEffect(() => {
    if (!open || !roundId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setHashOk(null);
    setTrapsOk(null);
    setComputed(null);
    (async () => {
      try {
        const res = await revealFn({ data: { id: roundId } });
        if (cancelled) return;
        setData(res);
        const h = await sha256Hex(res.serverSeed);
        const traps = await recomputeTraps(
          res.serverSeed,
          res.clientSeed,
          res.nonce,
          res.gridRows * res.gridCols,
          res.trapCount,
        );
        if (cancelled) return;
        setComputed(traps);
        setHashOk(h === res.serverSeedHash);
        const a = [...traps].sort((x, y) => x - y).join(",");
        const b = [...res.trapIndices].sort((x, y) => x - y).join(",");
        setTrapsOk(a === b);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load verification data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, roundId, revealFn]);

  const valid = hashOk === true && trapsOk === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl border-[var(--color-neon)]/40 bg-[var(--color-surface)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.24em] text-[var(--color-neon)]">
            <ShieldCheck className="h-4 w-4" />
            Verify round
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-6 text-[12px] text-[var(--color-ink-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading verification data…
          </div>
        )}
        {error && <p className="text-[12px] text-destructive">{error}</p>}

        {data && !loading && (
          <div className="max-h-[70vh] space-y-3 overflow-y-auto text-[11px]">
            <div
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                valid
                  ? "border-[var(--color-neon)]/50 bg-[var(--color-neon)]/10 text-[var(--color-neon)]"
                  : "border-destructive/50 bg-destructive/10 text-destructive"
              }`}
            >
              {valid ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              <span className="font-bold uppercase tracking-[0.2em]">
                {valid ? "Provably fair — verified" : "Verification mismatch"}
              </span>
            </div>

            <Row label="Verification ID" value={data.verificationId} />
            <Row label="Server seed (revealed)" value={data.serverSeed} />
            <Row
              label="SHA-256 (server seed)"
              value={data.serverSeedHash}
              status={hashOk}
              statusLabel="matches committed hash"
            />
            <Row label="Client seed" value={data.clientSeed} />
            <Row label="Nonce" value={String(data.nonce)} />
            <Row
              label="Board"
              value={`${data.gridRows}×${data.gridCols} · ${data.trapCount} traps · ${data.difficulty}`}
            />
            <Row
              label="Recorded trap tiles"
              value={[...data.trapIndices].sort((a, b) => a - b).join(", ") || "—"}
              status={trapsOk}
              statusLabel="matches recomputed traps"
            />
            <Row
              label="Recomputed trap tiles"
              value={computed ? [...computed].sort((a, b) => a - b).join(", ") : "—"}
            />
            <Row label="Safe reveals" value={String(data.safeReveals)} />
            <Row
              label="Trap opened"
              value={
                data.selectedTrapIndex === null
                  ? "none — collected"
                  : `tile ${data.selectedTrapIndex}`
              }
            />
            <Row label="Final multiplier" value={`${data.finalMultiplier.toFixed(4)}×`} />
            <Row label="Config version" value={`v${data.configVersion} · rtp v${data.rtpVersion}`} />

            <p className="pt-1 text-[10px] leading-relaxed text-[var(--color-ink-muted)]">
              The server committed to SHA-256(server seed) before your first tile. Trap positions
              come from a Fisher–Yates shuffle of all {data.gridRows * data.gridCols} tiles driven by
              HMAC-SHA256(server_seed, client_seed:nonce:counter), read as 32-bit words with
              rejection sampling so every layout is equally likely. The board was fixed before you
              clicked anything.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  status,
  statusLabel,
}: {
  label: string;
  value: string;
  status?: boolean | null;
  statusLabel?: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-[9px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
        <span>{label}</span>
        {status === true && (
          <span className="inline-flex items-center gap-1 text-[var(--color-neon)]">
            <CheckCircle2 className="h-3 w-3" />
            {statusLabel}
          </span>
        )}
        {status === false && (
          <span className="inline-flex items-center gap-1 text-destructive">
            <XCircle className="h-3 w-3" />
            mismatch
          </span>
        )}
      </div>
      <div className="mt-0.5 break-all rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-2 py-1.5 font-mono text-[10px] text-[var(--color-ink)]">
        {value}
      </div>
    </div>
  );
}
