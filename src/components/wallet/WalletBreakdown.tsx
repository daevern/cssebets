import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Wallet as WalletIcon } from "lucide-react";
import { getMyWalletBreakdown, type WalletBreakdown } from "@/lib/bonus.functions";
import { useAuth } from "@/hooks/use-auth";
import { StencilPanel } from "@/components/ui/page-shell";
import { BONUS_TERMS } from "@/components/wallet/BonusAwardModal";

function Row({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="flex items-center justify-between border border-[var(--color-surface-border)] bg-[#070D0A] px-3 py-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">{label}</span>
      <span className={`font-bold tabular-nums ${accent ?? "text-[var(--color-ink)]"}`}>
        {value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}

function Progress({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = Math.max(0, Math.min(100, (value / target) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
        <span>{label}</span>
        <span className="tabular-nums">
          {Math.min(value, target).toLocaleString()} / {target.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-border)]">
        <div className="h-full rounded-full bg-[var(--color-neon)] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function useWalletBreakdown() {
  const { user } = useAuth();
  const uid = user?.id;
  const fn = useServerFn(getMyWalletBreakdown);
  return useQuery({
    queryKey: ["my-wallet-breakdown", uid],
    queryFn: () => fn({}) as Promise<WalletBreakdown>,
    enabled: !!uid && (user as any)?.is_anonymous !== true,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function WalletBreakdownPanel() {
  const q = useWalletBreakdown();
  const d = q.data;
  if (!d) return null;

  return (
    <StencilPanel kicker={<><WalletIcon className="h-3 w-3" /> Balance breakdown</>}>
      <div className="space-y-2">
        <Row label="Total balance" value={d.total} />
        <Row label="Withdrawable" value={d.withdrawable} accent="text-[var(--color-neon)]" />
        <Row label="Locked bonus" value={d.lockedBonus} />
        <Row label="Reserved / pending" value={d.reserved} />
      </div>

      <div className="mt-4 space-y-3">
        <Progress label="Progress to 100 withdrawable" value={d.withdrawable} target={d.minWithdrawable} />
        <Progress label="Progress to 200 total" value={d.total} target={d.minTotal} />
      </div>

      <div className="mt-4 flex items-start gap-2 border border-[var(--color-surface-border)] bg-[#070D0A] p-3">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-ink-muted)]" />
        <div className="text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
          {d.canWithdraw ? (
            <span className="text-[var(--color-neon)]">You're eligible to request a withdrawal.</span>
          ) : (
            <span>{d.blockReason}</span>
          )}
          <div className="mt-1">{BONUS_TERMS}</div>
        </div>
      </div>
    </StencilPanel>
  );
}
