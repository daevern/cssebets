import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { revealPlinkoSeed } from "@/lib/arcade/plinko-phase2.functions";
import { Loader2, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Bytes(keyText: string, msg: string): Promise<Uint8Array> {
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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function recomputePath(serverSeed: string, clientSeed: string, nonce: number, rows: number) {
  const path: number[] = [];
  let round = 0;
  let combinedHex = "";
  while (path.length < rows) {
    const bytes = await hmacSha256Bytes(serverSeed, `${clientSeed}:${nonce}:${round}`);
    combinedHex += bytesToHex(bytes);
    for (let i = 0; i < bytes.length && path.length < rows; i++) {
      path.push(bytes[i] % 2);
    }
    round += 1;
  }
  return { path, hmacHex: combinedHex };
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  gameId: string | null;
};

export function VerifyDialog({ open, onOpenChange, gameId }: Props) {
  const revealFn = useServerFn(revealPlinkoSeed);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof revealFn>> | null>(null);
  const [hashCheck, setHashCheck] = useState<boolean | null>(null);
  const [pathCheck, setPathCheck] = useState<boolean | null>(null);
  const [computedPath, setComputedPath] = useState<number[] | null>(null);
  const [computedHmac, setComputedHmac] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !gameId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setHashCheck(null);
    setPathCheck(null);
    (async () => {
      try {
        const res = await revealFn({ data: { id: gameId } });
        if (cancelled) return;
        setData(res);
        const h = await sha256Hex(res.serverSeed);
        const { path: cp, hmacHex } = await recomputePath(
          res.serverSeed,
          res.clientSeed,
          res.nonce,
          res.rows,
        );
        if (cancelled) return;
        setComputedHmac(hmacHex);
        setComputedPath(cp);
        setHashCheck(h === res.serverSeedHash);
        setPathCheck(JSON.stringify(cp) === JSON.stringify(res.path));
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load verification data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, gameId, revealFn]);

  const bothValid = hashCheck === true && pathCheck === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-[var(--color-neon)]/40 bg-[var(--color-surface)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.24em] text-[var(--color-neon)]">
            <ShieldCheck className="h-4 w-4" />
            Verify drop
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-6 text-[12px] text-[var(--color-ink-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading verification data…
          </div>
        )}
        {error && <p className="text-[12px] text-red-400">{error}</p>}

        {data && !loading && (
          <div className="space-y-3 text-[11px]">
            <div
              className={`flex items-center gap-2 border px-3 py-2 ${
                bothValid
                  ? "border-[var(--color-neon)]/50 bg-[var(--color-neon)]/10 text-[var(--color-neon)]"
                  : "border-red-500/50 bg-red-500/5 text-red-400"
              }`}
            >
              {bothValid ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              <span className="font-bold uppercase tracking-[0.2em]">
                {bothValid ? "Provably fair — verified" : "Verification mismatch"}
              </span>
            </div>

            <Row label="Server seed" value={data.serverSeed} />
            <Row
              label="SHA-256 (server seed)"
              value={data.serverSeedHash}
              status={hashCheck}
              statusLabel="matches committed hash"
            />
            <Row label="Client seed" value={data.clientSeed} />
            <Row label="Nonce" value={String(data.nonce)} />
            <Row label="HMAC-SHA256(server, client:nonce:round…)" value={computedHmac ?? "—"} />
            <Row
              label="Committed path"
              value={data.path.join(" · ")}
              status={pathCheck}
              statusLabel="matches recomputed path"
            />
            <Row label="Recomputed path" value={(computedPath ?? []).join(" · ")} />
            <Row label="Landing slot" value={String(data.landingSlot)} />

            <p className="pt-2 text-[10px] leading-relaxed text-[var(--color-ink-muted)]">
              The server committed to the SHA-256 of its seed before you dropped. The path is
              derived from HMAC-SHA256(server_seed, client_seed:nonce:round), one bit per byte.
              Anyone can recompute both to prove the outcome was not tampered with.
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
      <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
        <span>{label}</span>
        {status === true && (
          <span className="inline-flex items-center gap-1 text-[var(--color-neon)]">
            <CheckCircle2 className="h-3 w-3" />
            {statusLabel}
          </span>
        )}
        {status === false && (
          <span className="inline-flex items-center gap-1 text-red-400">
            <XCircle className="h-3 w-3" />
            mismatch
          </span>
        )}
      </div>
      <div className="mt-0.5 break-all rounded-none border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-2 py-1.5 font-mono text-[10px] text-[var(--color-ink)]">
        {value}
      </div>
    </div>
  );
}
