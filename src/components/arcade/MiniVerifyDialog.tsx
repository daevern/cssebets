import { Dialog } from "@/components/ui/dialog";
import { StencilDialogContent } from "@/components/wallet/StencilDialog";
import type { MiniProduct } from "@/lib/arcade/mini-math";
import { ARCADE_THEMES } from "@/lib/arcade/theme";

/**
 * Fairness receipt for Hi-Lo, Dice and Fortune Wheel.
 * The server seed is only present once the round has settled — until then the
 * player only ever sees its hash, which is what makes the commitment binding.
 */
export function MiniVerifyDialog({
  product,
  open,
  onOpenChange,
  round,
}: {
  product: MiniProduct;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  round: any;
}) {
  const t = ARCADE_THEMES[product];
  const rows: { label: string; value: string }[] = [
    { label: "Verification ID", value: String(round?.verificationId ?? "—") },
    { label: "Server seed hash", value: String(round?.serverSeedHash ?? "—") },
    { label: "Server seed", value: String(round?.serverSeed ?? "revealed on settle") },
    { label: "Client seed", value: String(round?.clientSeed ?? "—") },
    { label: "Nonce", value: String(round?.nonce ?? 0) },
    { label: "Random hex", value: String(round?.randomHex ?? "—") },
    { label: "Config version", value: String(round?.configVersion ?? 1) },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <StencilDialogContent
        kicker="Provably fair"
        title={t.label}
        description="The outcome was derived from the server seed below, which was committed (hashed) before you acted. Hash the revealed seed to confirm it matches."
      >
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div
              key={r.label}
              className="rounded-[6px] border px-2.5 py-1.5"
              style={{ background: t.hud.plaqueBg, borderColor: t.hud.plaqueBorder }}
            >
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                {r.label}
              </div>
              <div className="break-all font-mono text-[11px] text-[var(--color-ink)]">
                {r.value}
              </div>
            </div>
          ))}
        </div>
      </StencilDialogContent>
    </Dialog>
  );
}
