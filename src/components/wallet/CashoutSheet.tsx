import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog } from "@/components/ui/dialog";
import { Loader2, CheckCircle2, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { getMyWallet } from "@/lib/wallet.functions";
import {
  getMySavedBankAccounts,
  createPayoutRequest,
} from "@/lib/payout.functions";
import { useAuth } from "@/hooks/use-auth";
import { StencilDialogContent } from "@/components/wallet/StencilDialog";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onNavigateAway?: () => void;
};

/* ---------- buttons ---------- */

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

function bankInitial(name: string) {
  return (name || "?").trim().slice(0, 1).toUpperCase();
}

/* ---------- main sheet ---------- */

export function CashoutSheet({ open, onOpenChange, onNavigateAway }: Props) {
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const walletFn = useServerFn(getMyWallet);
  const banksFn = useServerFn(getMySavedBankAccounts);
  const createFn = useServerFn(createPayoutRequest);

  const wallet = useQuery({
    queryKey: ["my-wallet", uid],
    queryFn: () => walletFn({}),
    enabled: !!uid && open,
    staleTime: 0,
  });
  const banks = useQuery({
    queryKey: ["my-saved-banks", uid],
    queryFn: () => banksFn({}),
    enabled: !!uid && open,
    staleTime: 0,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [success, setSuccess] = useState(false);
  const [submittedAmount, setSubmittedAmount] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setAmount("");
      setSuccess(false);
      setSubmittedAmount(null);
    }
  }, [open]);

  useEffect(() => {
    const list = banks.data?.accounts ?? [];
    if (open && list.length && !selectedId) setSelectedId(list[0].id);
  }, [banks.data, open, selectedId]);

  const balance = Number(wallet.data?.balance ?? 0);
  const accounts = banks.data?.accounts ?? [];
  const loading = wallet.isLoading || banks.isLoading;
  const hasBank = accounts.length > 0;

  const submit = useMutation({
    mutationFn: async () => {
      const acc = accounts.find((a) => a.id === selectedId);
      if (!acc) throw new Error("Select a saved bank account.");
      const amt = Number(amount);
      return createFn({
        data: {
          bankName: acc.bankName,
          bankAccountNumber: acc.accountNumber,
          amount: amt,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-payouts", uid] });
      qc.invalidateQueries({ queryKey: ["my-wallet", uid] });
      setSubmittedAmount(Number(amount));
      setSuccess(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const amt = Number(amount);
  const amountValid = amount !== "" && amt > 0 && amt <= balance;
  const canSubmit = hasBank && !!selectedId && amountValid && !submit.isPending;

  const selectedAcc = useMemo(
    () => accounts.find((a) => a.id === selectedId) ?? null,
    [accounts, selectedId],
  );

  function goToPayoutPage(opts?: { add?: boolean }) {
    onOpenChange(false);
    onNavigateAway?.();
    navigate({ to: "/payout", search: opts?.add ? { add: 1 } : undefined } as any);
  }

  function setMax() {
    if (balance) setAmount(String(Math.floor(balance)));
  }

  /* ---------- No saved bank ---------- */
  if (open && !loading && !hasBank && !success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <StencilDialogContent
          kicker="Cashout · Setup"
          title="Link a bank account"
          description="Save your payout details once. They'll be ready for every cashout to come."
          footer={
            <>
              <GhostBtn onClick={() => onOpenChange(false)}>Cancel</GhostBtn>
              <NeonBtn onClick={() => goToPayoutPage({ add: true })}>
                Add account <ArrowRight className="h-3.5 w-3.5" />
              </NeonBtn>
            </>
          }
        />
      </Dialog>
    );
  }

  /* ---------- Success ---------- */
  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <StencilDialogContent
          kicker="Cashout · Submitted"
          title="Request received"
          description={
            selectedAcc
              ? `Sending to ${selectedAcc.bankName} · ${selectedAcc.masked}.`
              : "We'll process your request shortly."
          }
          footer={
            <>
              <GhostBtn onClick={() => onOpenChange(false)}>Close</GhostBtn>
              <NeonBtn onClick={() => goToPayoutPage()}>
                Track status <ArrowRight className="h-3.5 w-3.5" />
              </NeonBtn>
            </>
          }
        >
          <div className="flex flex-col items-center py-6 animate-fade-in">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-neon)]/10 ring-1 ring-[var(--color-neon)]/30">
              <Check className="h-5 w-5 text-[var(--color-neon)]" strokeWidth={3} />
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="font-display text-4xl font-semibold tabular-nums text-[var(--color-ink)]">
                {(submittedAmount ?? 0).toLocaleString()}
              </span>
              <span className="text-xs font-medium text-[var(--color-ink-muted)]">pts</span>
            </div>
          </div>
        </StencilDialogContent>
      </Dialog>
    );
  }

  /* ---------- Cashout form ---------- */
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <StencilDialogContent
        title="Cash out"
        description={
          !loading
            ? `${balance.toLocaleString()} pts available`
            : undefined
        }
        footer={
          <>
            <GhostBtn onClick={() => onOpenChange(false)} disabled={submit.isPending}>
              Cancel
            </GhostBtn>
            <NeonBtn onClick={() => submit.mutate()} disabled={!canSubmit}>
              {submit.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending
                </>
              ) : (
                <>Confirm</>
              )}
            </NeonBtn>
          </>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-ink-muted)]" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Amount — the hero */}
            <div>
              <div
                className={`group relative flex items-baseline justify-center gap-2 border-b py-4 transition-colors ${
                  amt > balance
                    ? "border-destructive/60"
                    : amountValid
                      ? "border-[var(--color-neon)]/60"
                      : "border-[var(--color-surface-border)] focus-within:border-[var(--color-ink-muted)]/50"
                }`}
              >
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={balance}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full bg-transparent text-center font-display text-5xl font-semibold tabular-nums tracking-tight text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)]/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--color-ink-muted)]">
                  pts
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-[var(--color-ink-muted)]">
                  {amt > balance
                    ? "Exceeds balance"
                    : amountValid
                      ? `${(balance - amt).toLocaleString()} left after`
                      : "Enter amount"}
                </span>
                <button
                  type="button"
                  onClick={setMax}
                  disabled={!balance}
                  className="text-[11px] font-semibold text-[var(--color-neon)] transition-opacity hover:opacity-80 disabled:opacity-40"
                >
                  Max
                </button>
              </div>
            </div>

            {/* Destination — single-line list */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">To</span>
                <button
                  type="button"
                  onClick={goToPayoutPage}
                  className="text-[11px] font-medium text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-neon)]"
                >
                  Manage
                </button>
              </div>
              <div className="space-y-1">
                {accounts.map((a) => {
                  const active = selectedId === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSelectedId(a.id)}
                      className={`group flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-all ${
                        active
                          ? "border-[var(--color-neon)]/50 bg-[var(--color-neon)]/[0.04]"
                          : "border-[var(--color-surface-border)] hover:border-[var(--color-ink-muted)]/40"
                      }`}
                    >
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-[11px] font-semibold transition-colors ${
                          active
                            ? "bg-[var(--color-neon)] text-black"
                            : "bg-[#050E0A] text-[var(--color-ink-muted)]"
                        }`}
                      >
                        {bankInitial(a.bankName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-[var(--color-ink)]">
                          {a.bankName}
                        </div>
                        <div className="truncate font-mono text-[11px] text-[var(--color-ink-muted)]">
                          {a.masked}
                        </div>
                      </div>
                      {active && (
                        <CheckCircle2 className="h-4 w-4 text-[var(--color-neon)] animate-scale-in" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </StencilDialogContent>
    </Dialog>
  );
}
