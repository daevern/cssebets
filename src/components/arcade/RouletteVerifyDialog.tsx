import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { revealRouletteSeed } from "@/lib/arcade/roulette-phase2.functions";
import { Loader2, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacHex(keyText: string, msg: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyText),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Mirrors arcade_roulette_draw: rejection sampling over 32-bit words, mod 37. */
async function recomputePocket(serverSeed: string, clientSeed: string, nonce: number) {
  const LIMIT = 4294967289; // floor(2^32 / 37) * 37
  for (let round = 0; round <= 32; round++) {
    const hex = await hmacHex(serverSeed, `${clientSeed}:${nonce}:${round}`);
    for (let i = 0; i < 8; i++) {
      const u = parseInt(hex.slice(i * 8, i * 8 + 8), 16);
      if (u < LIMIT) return { pocket: u % 37, hex };
    }
  }
  return { pocket: 0, hex: "" };
}

export function RouletteVerifyDialog({
  open,
  onOpenChange,
  spinId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  spinId: string | null;
}) {
  const revealFn = useServerFn(revealRouletteSeed);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof revealFn>> | null>(null);
  const [hashOk, setHashOk] = useState<boolean | null>(null);
  const [pocketOk, setPocketOk] = useState<boolean | null>(null);
  const [computed, setComputed] = useState<{ pocket: number; hex: string } | null>(null);

  useEffect(() => {
    if (!open || !spinId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setHashOk(null);
    setPocketOk(null);
    setComputed(null);
    (async () => {
      try {
        const res = await revealFn({ data: { id: spinId } });
        if (cancelled) return;
        setData(res);
        const h = await sha256Hex(res.serverSeed);
        const c = await recomputePocket(res.serverSeed, res.clientSeed, res.nonce);
        if (cancelled) return;
        setComputed(c);
        setHashOk(h === res.serverSeedHash);
        setPocketOk(c.pocket === res.winningPocket);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load verification data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, spinId, revealFn]);

  const valid = hashOk === true && pocketOk === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl border-[var(--color-neon)]/40 bg-[var(--color-surface)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.24em] text-[var(--color-neon)]">
            <ShieldCheck className="h-4 w-4" />
            Verify spin
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
              label="HMAC-SHA256(server, client:nonce:round)"
              value={computed?.hex ?? data.randomHex}
            />
            <Row
              label="Recorded pocket"
              value={`${data.winningPocket} (${data.winningColour})`}
              status={pocketOk}
              statusLabel="matches recomputed pocket"
            />
            <Row label="Recomputed pocket" value={String(computed?.pocket ?? "—")} />
            <Row label="Config version" value={`v${data.configVersion}`} />

            <p className="pt-1 text-[10px] leading-relaxed text-[var(--color-ink-muted)]">
              The server committed to SHA-256(server seed) before the spin. The pocket is derived
              from HMAC-SHA256(server_seed, client_seed:nonce:round), read as 32-bit words with
              rejection sampling above {(4294967289).toLocaleString()} so all 37 pockets stay
              exactly equally likely (1/37).
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
