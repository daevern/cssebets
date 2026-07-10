import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Banknote,
  CheckCircle2,
  ShieldAlert,
  ArrowUpFromLine,
  Landmark,
  Sparkles,
  ArrowRight,
} from "lucide-react";
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
  /** Called when the user is being redirected to /payout (parent can close its own sheet). */
  onNavigateAway?: () => void;
};

/* ---------- shared visual primitives ---------- */

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
      className="inline-flex items-center justify-center gap-1.5 rounded-none border border-[var(--color-surface-border)] bg-[#050E0A] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-neon)]/40 hover:text-[var(--color-ink)] disabled:opacity-40"
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
      className="inline-flex items-center justify-center gap-1.5 rounded-none bg-[var(--color-neon)] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.24em] text-black shadow-[0_0_24px_var(--color-neon-glow)] transition-all hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
    >
      {children}
    </button>
  );
}

/* ---------- account row ---------- */

function bankInitial(name: string) {
  const s = (name || "?").trim();
  return s.slice(0, 1).toUpperCase();
}

function AccountRow({
  bankName,
  masked,
  active,
  onClick,
}: {
  bankName: string;
  masked: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex w-full items-center gap-3 border px-3 py-3 text-left transition-all ${
        active
          ? "border-[var(--color-neon)]/60 bg-[var(--color-neon)]/[0.06] shadow-[0_0_0_1px_var(--color-neon-glow)_inset]"
          : "border-[var(--color-surface-border)] bg-[#050E0A] hover:border-[var(--color-neon)]/30"
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center border font-display text-sm font-bold tabular-nums ${
          active
            ? "border-[var(--color-neon)]/60 bg-[var(--color-neon)]/10 text-[var(--color-neon)]"
            : "border-[var(--color-surface-border)] bg-[#020806] text-[var(--color-ink-muted)]"
        }`}
      >
        {bankInitial(bankName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
          {bankName}
        </div>
        <div className="mt-0.5 font-mono text-sm tabular-nums text-[var(--color-ink)]">
          {masked}
        </div>
      </div>
      <div
        className={`flex h-5 w-5 items-center justify-center border ${
          active
            ? "border-[var(--color-neon)] bg-[var(--color-neon)] text-black"
            : "border-[var(--color-surface-border)] bg-transparent"
        }`}
      >
        {active && <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={3} />}
      </div>
    </button>
  );
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

  function goToPayoutPage() {
    onOpenChange(false);
    onNavigateAway?.();
    navigate({ to: "/payout" });
  }

  function setPct(pct: number) {
    if (!balance) return;
    setAmount(String(Math.floor(balance * pct)));
  }

  /* ---------- No saved bank ---------- */
  if (open && !loading && !hasBank && !success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <StencilDialogContent
          accent
          kicker={<><ShieldAlert className="h-3 w-3" /> Setup required</>}
          title="Add a bank account to cash out"
          description="Your points are ready to withdraw. Save your payout bank details once — they'll appear here every time you cash out."
          footer={
            <>
              <GhostBtn onClick={() => onOpenChange(false)}>Cancel</GhostBtn>
              <NeonBtn onClick={goToPayoutPage}>
                Add bank account <ArrowRight className="h-3.5 w-3.5" />
              </NeonBtn>
            </>
          }
        >
          <div className="flex items-start gap-3 border border-dashed border-[var(--color-surface-border)] bg-[#050E0A] p-4">
            <Landmark className="h-5 w-5 shrink-0 text-[var(--color-neon)]" />
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-neon)]">
                One-time setup
              </div>
              <p className="text-sm text-[var(--color-ink-muted)]">
                We keep bank details encrypted and only visible to you. You can add
                multiple accounts and pick one at cashout.
              </p>
            </div>
          </div>
        </StencilDialogContent>
      </Dialog>
    );
  }

  /* ---------- Success ---------- */
  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <StencilDialogContent
          accent
          kicker={<><Sparkles className="h-3 w-3" /> Request submitted</>}
          title="Cashout submitted for review"
          description="An admin will process your request shortly. You'll be notified when funds are on the way."
          footer={
            <>
              <GhostBtn onClick={() => onOpenChange(false)}>Close</GhostBtn>
              <NeonBtn onClick={goToPayoutPage}>
                Track status <ArrowRight className="h-3.5 w-3.5" />
              </NeonBtn>
            </>
          }
        >
          <div className="space-y-3">
            {/* Receipt block */}
            <div className="border border-[var(--color-surface-border)] bg-[#020806] p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
                  Withdrawing
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-neon)]">
                  Pending
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold tabular-nums text-[var(--color-ink)]">
                  {(submittedAmount ?? 0).toLocaleString()}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-neon)]">
                  pts
                </span>
              </div>
              {selectedAcc && (
                <div className="mt-3 flex items-center gap-2 border-t border-dashed border-[var(--color-surface-border)] pt-3">
                  <div className="flex h-6 w-6 items-center justify-center border border-[var(--color-surface-border)] bg-[#050E0A] text-[10px] font-bold text-[var(--color-ink-muted)]">
                    {bankInitial(selectedAcc.bankName)}
                  </div>
                  <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">
                    {selectedAcc.bankName} · <span className="font-mono">{selectedAcc.masked}</span>
                  </span>
                </div>
              )}
            </div>

            <div className="border border-dashed border-[var(--color-surface-border)] bg-[#050E0A] p-3 text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
              <span className="font-bold uppercase tracking-[0.22em] text-[var(--color-neon)]">
                ETA
              </span>{" "}
              — Cashouts are typically processed within 30 minutes to 6 hours,
              subject to admin review and bank availability. Contact support if
              yours takes longer than expected.
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
        kicker={<><ArrowUpFromLine className="h-3 w-3" /> Cash out · Withdraw points</>}
        title="Send points to your bank"
        description="Select a saved account and enter the amount you want to withdraw."
        footer={
          <>
            <GhostBtn onClick={() => onOpenChange(false)} disabled={submit.isPending}>
              Cancel
            </GhostBtn>
            <NeonBtn onClick={() => submit.mutate()} disabled={!canSubmit}>
              {submit.isPending ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Submitting…
                </>
              ) : (
                <>
                  Confirm cashout <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </NeonBtn>
          </>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--color-ink-muted)]" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Balance strip */}
            <div className="relative overflow-hidden border border-[var(--color-surface-border)] bg-[#020806] p-4">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.08]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg, var(--color-neon) 0 1px, transparent 1px 6px)",
                }}
              />
              <div className="relative flex items-end justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
                    Available balance
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="font-display text-3xl font-bold tabular-nums text-[var(--color-ink)]">
                      {balance.toLocaleString()}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-neon)]">
                      pts
                    </span>
                  </div>
                </div>
                <Banknote className="h-8 w-8 text-[var(--color-neon)]/40" />
              </div>
            </div>

            {/* Bank selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
                  Destination account
                </label>
                <button
                  type="button"
                  onClick={goToPayoutPage}
                  className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-neon)] hover:underline"
                >
                  Manage →
                </button>
              </div>
              <div className="space-y-1.5">
                {accounts.map((a) => (
                  <AccountRow
                    key={a.id}
                    bankName={a.bankName}
                    masked={a.masked}
                    active={selectedId === a.id}
                    onClick={() => setSelectedId(a.id)}
                  />
                ))}
              </div>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
                  Withdraw amount
                </label>
                <div className="flex items-center gap-1">
                  {[
                    { label: "25%", pct: 0.25 },
                    { label: "50%", pct: 0.5 },
                    { label: "75%", pct: 0.75 },
                    { label: "MAX", pct: 1 },
                  ].map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => setPct(c.pct)}
                      disabled={!balance}
                      className="border border-[var(--color-surface-border)] bg-[#050E0A] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-neon)]/40 hover:text-[var(--color-neon)] disabled:opacity-40"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className={`flex items-center border bg-[#020806] px-4 py-3 transition-colors ${
                  amt > balance
                    ? "border-destructive/60"
                    : amountValid
                      ? "border-[var(--color-neon)]/40"
                      : "border-[var(--color-surface-border)]"
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
                  className="w-full bg-transparent font-display text-2xl font-bold tabular-nums text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)]/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-neon)]">
                  pts
                </span>
              </div>

              {amount !== "" && amt <= 0 && (
                <p className="text-[11px] text-destructive">
                  Amount must be greater than 0.
                </p>
              )}
              {amt > balance && (
                <p className="text-[11px] text-destructive">
                  Amount exceeds your available balance.
                </p>
              )}
            </div>
          </div>
        )}
      </StencilDialogContent>
    </Dialog>
  );
}
