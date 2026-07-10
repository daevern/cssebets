import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StencilDialogContent } from "@/components/wallet/StencilDialog";
import { ArrowRight, Wallet as WalletIcon } from "lucide-react";
import { getMyWallet } from "@/lib/wallet.functions";
import { useAuth } from "@/hooks/use-auth";

const MIN_TOPUP = 50;
const MAX_TOPUP = 1_000_000;
const QUICK = [100, 300, 500, 1000];

export function TopUpAmountModal({
  open,
  onOpenChange,
  onNavigateAway,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onNavigateAway?: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const uid = user?.id;
  const wFn = useServerFn(getMyWallet);
  const wallet = useQuery({
    queryKey: ["my-wallet", uid],
    queryFn: () => wFn({}),
    enabled: !!uid && open,
    staleTime: 5_000,
  });

  const [amount, setAmount] = useState<string>("100");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount("100");
      setSubmitting(false);
    }
  }, [open]);

  const amt = Number(amount);
  const valid = Number.isFinite(amt) && amt >= MIN_TOPUP && amt <= MAX_TOPUP;
  const errorText =
    amount === ""
      ? null
      : !Number.isFinite(amt)
      ? "Enter a valid number."
      : amt < MIN_TOPUP
      ? `Minimum top-up is ${MIN_TOPUP} pts.`
      : amt > MAX_TOPUP
      ? `Maximum top-up is ${MAX_TOPUP.toLocaleString()} pts.`
      : null;

  function handleContinue() {
    if (!valid || submitting) return;
    setSubmitting(true);
    onOpenChange(false);
    onNavigateAway?.();
    navigate({ to: "/wallet", search: { amount: amt } as any });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <StencilDialogContent
        kicker={<><WalletIcon className="h-3 w-3" /> Wallet · Top up</>}
        title="Top Up Wallet"
        description="Enter the amount of points you want to top up. You'll get bank transfer details on the next step."
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="rounded-full text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              Cancel
            </Button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={!valid || submitting}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-neon)] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.22em] text-black shadow-[0_0_24px_var(--color-neon-glow)] transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-40 disabled:shadow-none"
            >
              Continue
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </>
        }
      >
        {/* Available balance */}
        <div className="mb-4 flex items-baseline justify-between border-b border-dashed border-[var(--color-surface-border)] pb-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
            Available
          </span>
          <span className="font-mono text-lg font-bold tabular-nums text-[var(--color-ink)]">
            {wallet.isLoading ? "…" : Number(wallet.data?.balance ?? 0).toLocaleString()}
            <span className="ml-1 text-[10px] font-bold uppercase tracking-widest text-[var(--color-ink-muted)]">pts</span>
          </span>
        </div>

        <label className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
          Top-up amount
        </label>
        <div className="mt-1.5 flex items-center gap-2 border border-[var(--color-surface-border)] bg-[#070D0A] px-3 py-2 focus-within:border-[var(--color-neon)]/60">
          <Input
            autoFocus
            type="number"
            inputMode="numeric"
            min={MIN_TOPUP}
            max={MAX_TOPUP}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleContinue();
            }}
            placeholder="100"
            className="border-0 bg-transparent p-0 font-mono text-2xl font-bold tabular-nums text-[var(--color-ink)] shadow-none focus-visible:ring-0"
          />
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">pts</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
          <span>Min {MIN_TOPUP} pts</span>
          {errorText && <span className="text-destructive normal-case tracking-normal">{errorText}</span>}
        </div>

        {/* Quick chips */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          {QUICK.map((q) => {
            const active = amt === q;
            return (
              <button
                key={q}
                type="button"
                onClick={() => setAmount(String(q))}
                className={`rounded-md border px-2 py-2 font-mono text-xs font-bold tabular-nums transition-all ${
                  active
                    ? "border-[var(--color-neon)] bg-[var(--color-neon)]/10 text-[var(--color-neon)]"
                    : "border-[var(--color-surface-border)] bg-[#070D0A] text-[var(--color-ink)] hover:border-[var(--color-neon)]/40"
                }`}
              >
                {q.toLocaleString()}
              </button>
            );
          })}
        </div>
      </StencilDialogContent>
    </Dialog>
  );
}
