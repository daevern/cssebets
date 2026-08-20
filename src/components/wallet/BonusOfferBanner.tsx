import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gift } from "lucide-react";
import { getCampaignStatus, type CampaignStatus } from "@/lib/bonus.functions";

/**
 * Trusted, server-side slot count. The offer is only shown while slots remain —
 * a slot is reserved server-side at registration, never promised beforehand.
 */
export function BonusOfferBanner({ className = "" }: { className?: string }) {
  const fn = useServerFn(getCampaignStatus);
  const q = useQuery({
    queryKey: ["bonus-campaign-status"],
    queryFn: () => fn() as Promise<CampaignStatus>,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const s = q.data;
  if (!s?.active || !s.slotsRemaining || s.slotsRemaining <= 0) return null;

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border border-[var(--color-neon)]/30 bg-[var(--color-neon)]/[0.05] px-3 py-2.5 ${className}`}
    >
      <Gift className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-neon)]" />
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-[var(--color-ink)]">
          Limited offer: 100-point bonus for the next 100 new users.
        </div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
          {s.slotsRemaining} of {s.cap} slots left. Bonus points can be used for wagers but cannot be withdrawn or
          transferred — only profit earned from bonus wagers becomes withdrawable.
        </div>
      </div>
    </div>
  );
}
