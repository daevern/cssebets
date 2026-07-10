import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog } from "@/components/ui/dialog";
import { StencilDialogContent } from "@/components/wallet/StencilDialog";
import { ArrowRight } from "lucide-react";
import { getMyWallet } from "@/lib/wallet.functions";
import { useAuth } from "@/hooks/use-auth";

const MIN_TOPUP = 50;
const MAX_TOPUP = 1_000_000;
const QUICK = [100, 300, 500, 1000];

/* ---------- buttons (match Cashout) ---------- */

function GhostBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-md px-4 py-2.5 text-[13px] font-medium text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function NeonBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--color-neon)] px-5 py-2.5 text-[13px] font-semibold text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function TopUpAmountModal({
  open,
  onOpenChange,
  onContinue,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called with the entered amount; parent should open the instructions modal. */
  onContinue: (amount: number) => void;
}) {
  const { user } = useAuth();
  const uid = user?.id;
  const wFn = useServerFn(getMyWallet);
  const wallet = useQuery({
    queryKey: ["my-wallet", uid],
    queryFn: () => wFn({}),
    enabled: !!uid && open,
    staleTime: 5_000,
  });

  const [amount, setAmount] = useState<string>("");

  useEffect(() => {
    if (open) setAmount("");
  }, [open]);

  const amt = Number(amount);
  const valid =
    amount !== "" && Number.isFinite(amt) && amt >= MIN_TOPUP && amt <= MAX_TOPUP;

  function handleContinue() {
    if (!valid) return;
    onOpenChange(false);
    onContinue(amt);
  }

  const balance = Number(wallet.data?.balance ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <StencilDialogContent
        kicker="Top up · Add points"
        title="Top up"
        footer={
          <>
            <GhostBtn onClick={() => onOpenChange(false)}>Cancel</GhostBtn>
            <NeonBtn onClick={handleContinue} disabled={!valid}>
              Continue <ArrowRight className="h-3.5 w-3.5" />
            </NeonBtn>
          </>
        }
      >
        <div className="space-y-6">
          {/* Amount — the hero (mirrors Cashout) */}
          <div>
            <div className="mb-2 text-center">
              <span className="text-base font-semibold text-[var(--color-ink)]">
                {wallet.isLoading ? "…" : balance.toLocaleString()} pts
              </span>
              <span className="ml-1 text-base font-medium text-[var(--color-ink-muted)]">
                current balance
              </span>
            </div>
            <div
              className={`group relative flex items-baseline justify-center gap-2 border-b py-4 transition-colors ${
                amount !== "" && !valid
                  ? "border-destructive/60"
                  : valid
                    ? "border-[var(--color-neon)]/60"
                    : "border-[var(--color-surface-border)] focus-within:border-[var(--color-ink-muted)]/50"
              }`}
            >
              <input
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
                placeholder="0"
                className="w-full bg-transparent text-center font-display text-5xl font-semibold tabular-nums tracking-tight text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)]/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--color-ink-muted)]">
                pts
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[13px] font-medium text-[var(--color-ink)]">
                {amount === ""
                  ? "Enter amount"
                  : !Number.isFinite(amt)
                    ? "Enter a valid number"
                    : amt < MIN_TOPUP
                      ? `Minimum ${MIN_TOPUP} pts`
                      : amt > MAX_TOPUP
                        ? `Maximum ${MAX_TOPUP.toLocaleString()} pts`
                        : `${(balance + amt).toLocaleString()} pts after top-up`}
              </span>
              <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">
                Min {MIN_TOPUP}
              </span>
            </div>
          </div>

          {/* Quick chips */}
          <div className="grid grid-cols-4 gap-2">
            {QUICK.map((q) => {
              const active = amt === q;
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(String(q))}
                  className={`rounded-md border px-2 py-2 font-mono text-[13px] font-semibold tabular-nums transition-all ${
                    active
                      ? "border-[var(--color-neon)] bg-[var(--color-neon)]/10 text-[var(--color-neon)]"
                      : "border-[var(--color-surface-border)] text-[var(--color-ink)] hover:border-[var(--color-ink-muted)]/40"
                  }`}
                >
                  {q.toLocaleString()}
                </button>
              );
            })}
          </div>
        </div>
      </StencilDialogContent>
    </Dialog>
  );
}
