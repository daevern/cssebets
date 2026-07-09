import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Banknote, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { getMyWallet } from "@/lib/wallet.functions";
import {
  getMySavedBankAccounts,
  createPayoutRequest,
} from "@/lib/payout.functions";
import { useAuth } from "@/hooks/use-auth";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called when the user is being redirected to /payout (parent can close its own sheet). */
  onNavigateAway?: () => void;
};

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

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setAmount("");
      setSuccess(false);
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
      setSuccess(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const amt = Number(amount);
  const amountValid = amount !== "" && amt > 0 && amt <= balance;
  const canSubmit = hasBank && !!selectedId && amountValid && !submit.isPending;

  function goToPayoutPage() {
    onOpenChange(false);
    onNavigateAway?.();
    navigate({ to: "/payout" });
  }

  // ---------- No saved bank modal ----------
  if (open && !loading && !hasBank && !success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bank Account Details Not Saved</DialogTitle>
            <DialogDescription>
              Please add your payout bank account details before requesting a cashout.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={goToPayoutPage}
              className="bg-[var(--color-neon)] text-black hover:brightness-110"
            >
              Add Bank Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ---------- Success modal ----------
  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-[var(--color-neon)]" />
              Cashout request submitted
            </DialogTitle>
            <DialogDescription>
              Your cashout will usually be processed within 30 minutes to 6 hours,
              depending on admin review, bank transfer availability, and verification checks.
              Please contact support if your cashout takes longer than expected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              onClick={goToPayoutPage}
              className="bg-[var(--color-neon)] text-black hover:brightness-110"
            >
              View Cashout Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ---------- Cashout modal ----------
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-[var(--surface-1,#0B1512)] border-[var(--color-surface-border)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-[var(--color-neon)]" />
            Cash out
          </DialogTitle>
          <DialogDescription>
            Select a saved bank account and enter the amount to withdraw.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--color-ink-muted)]" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Balance */}
            <div className="rounded-lg border border-[var(--color-surface-border)] bg-[#070D0A] p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
                Available balance
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-bold tabular-nums text-[var(--color-ink)]">
                  {balance.toLocaleString()}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-neon)]">
                  pts
                </span>
              </div>
            </div>

            {/* Bank selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
                Payout bank account
              </label>
              <div className="space-y-1.5">
                {accounts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                      selectedId === a.id
                        ? "border-[var(--color-neon)] bg-[var(--color-neon)]/10 text-[var(--color-ink)]"
                        : "border-[var(--color-surface-border)] bg-[#070D0A] text-[var(--color-ink-muted)] hover:border-[var(--color-neon)]/40"
                    }`}
                  >
                    <span className="font-medium">{a.masked}</span>
                    {selectedId === a.id && (
                      <CheckCircle2 className="h-4 w-4 text-[var(--color-neon)]" />
                    )}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={goToPayoutPage}
                className="text-[11px] font-medium text-[var(--color-neon)] hover:underline"
              >
                Manage bank details →
              </button>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
                Cashout amount (pts)
              </label>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={balance}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="bg-[#070D0A] border-[var(--color-surface-border)]"
              />
              {amount !== "" && amt <= 0 && (
                <p className="text-xs text-destructive">Amount must be greater than 0.</p>
              )}
              {amt > balance && (
                <p className="text-xs text-destructive">Amount exceeds your balance.</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={!canSubmit}
            className="bg-[var(--color-neon)] text-black hover:brightness-110 disabled:opacity-40"
          >
            {submit.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
              </>
            ) : (
              "Confirm Cashout"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
