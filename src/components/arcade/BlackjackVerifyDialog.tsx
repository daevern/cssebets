import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { revealBlackjackShoe } from "@/lib/arcade/blackjack-phase2.functions";
import { cardLabel } from "@/lib/arcade/blackjack-math";

/**
 * Shows the committed server-seed hash, the revealed seed and the resulting
 * shuffle so a player can independently recompute the deal.
 */
export function BlackjackVerifyDialog({
  handId,
  serverSeedHash,
  clientSeed,
  nonce,
}: {
  handId: string;
  serverSeedHash?: string | null;
  clientSeed?: string | null;
  nonce?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const reveal = useServerFn(revealBlackjackShoe);

  const revealM = useMutation({
    mutationFn: () => reveal({ data: { handId } }),
    onError: (e: any) => toast.error(e?.message ?? "Could not reveal the shoe."),
  });

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const data = revealM.data;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && !revealM.data && !revealM.isPending) revealM.mutate();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-center gap-1.5 border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-neon)]/40 hover:text-[var(--color-neon)]"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Verify
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-[var(--color-surface-border)] bg-[var(--color-surface)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold uppercase tracking-[0.2em]">
            Provably fair
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-[11px]">
          <Row
            label="Server seed hash"
            value={data?.serverSeedHash ?? serverSeedHash ?? "—"}
            onCopy={copy}
            copied={copied}
          />
          <Row label="Client seed" value={data?.clientSeed ?? clientSeed ?? "—"} onCopy={copy} copied={copied} />
          <Row label="Nonce" value={String(data?.nonce ?? nonce ?? "—")} onCopy={copy} copied={copied} />

          {revealM.isPending && (
            <div className="flex items-center gap-2 text-[var(--color-ink-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Revealing shoe…
            </div>
          )}

          {revealM.isError && (
            <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-300">
              {(revealM.error as any)?.message}
            </p>
          )}

          {data && (
            <>
              <Row label="Server seed (revealed)" value={data.serverSeed} onCopy={copy} copied={copied} />

              <div>
                <div className="pb-1 text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
                  Dealt cards ({data.cards.length} of {data.totalCards})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.cards.map((c) => (
                    <span
                      key={`${c.sequence}-${c.position}`}
                      className="border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-2 py-1 font-mono text-[10px] text-[var(--color-ink)]"
                    >
                      {c.owner === "DEALER" ? "D" : "P"} · {cardLabel(c.rank, c.suit)}
                    </span>
                  ))}
                </div>
              </div>

              <details className="border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-2">
                <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
                  Full shuffle order ({data.cardOrder.length} cards)
                </summary>
                <p className="max-h-40 overflow-y-auto break-all pt-2 font-mono text-[10px] leading-relaxed text-[var(--color-ink-muted)]">
                  {data.cardOrder.join(", ")}
                </p>
              </details>

              <p className="leading-relaxed text-[var(--color-ink-muted)]">
                The shoe order is a Fisher–Yates shuffle driven by an HMAC-SHA256 stream keyed with
                the server seed over <span className="font-mono">clientSeed:nonce:counter</span>.
                Hash the revealed server seed with SHA-256 and it must equal the hash committed
                before the deal.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: (l: string, v: string) => void;
  copied: string | null;
}) {
  return (
    <div>
      <div className="pb-1 text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
        {label}
      </div>
      <button
        type="button"
        onClick={() => value !== "—" && onCopy(label, value)}
        className="flex w-full items-start gap-2 break-all border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-left font-mono text-[10px] text-[var(--color-ink)]"
      >
        <span className="flex-1">{value}</span>
        {copied === label ? (
          <Check className="h-3 w-3 shrink-0 text-[var(--color-neon)]" />
        ) : (
          <Copy className="h-3 w-3 shrink-0 text-[var(--color-ink-muted)]" />
        )}
      </button>
    </div>
  );
}
