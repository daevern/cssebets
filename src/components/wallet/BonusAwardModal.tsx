import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog } from "@/components/ui/dialog";
import { StencilDialogContent } from "@/components/wallet/StencilDialog";
import { claimCampaignBonus, type BonusClaimResult } from "@/lib/bonus.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

const BONUS_TERMS =
  "Bonus points can be used for wagers but cannot be withdrawn or transferred. Only profit earned from bonus wagers becomes withdrawable. You need at least 100 withdrawable points and a total wallet balance of at least 200 points to request a withdrawal.";

/**
 * Claims the campaign bonus once per login and shows the award message a
 * single time. The award itself is server-authoritative and idempotent — this
 * component can safely mount on every render/refresh/device.
 */
export function BonusAwardModal() {
  const { user, isMember, isAdmin } = useAuth();
  const uid = user?.id;
  const isGuest = !user || (user as any)?.is_anonymous === true;
  const claimFn = useServerFn(claimCampaignBonus);
  const qc = useQueryClient();
  const [result, setResult] = useState<BonusClaimResult | null>(null);

  useEffect(() => {
    if (!uid || isGuest || !(isMember || isAdmin)) return;
    const seenKey = `csse:bonus-claimed:${uid}`;
    if (sessionStorage.getItem(seenKey)) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      try {
        const res = (await claimFn({ headers: { Authorization: `Bearer ${token}` } } as any)) as BonusClaimResult;
        sessionStorage.setItem(seenKey, "1");
        if (cancelled) return;
        if (res?.awarded) {
          setResult(res);
          qc.invalidateQueries({ queryKey: ["my-wallet", uid] });
          qc.invalidateQueries({ queryKey: ["my-wallet-breakdown", uid] });
        }
      } catch {
        /* non-fatal — the bonus is claimed again on the next login */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, isGuest, isMember, isAdmin, claimFn, qc]);

  if (!result?.awarded) return null;

  const isNew = result.group === "NEW_USER";
  const title = isNew
    ? "Welcome to CSSEBets! You are one of the first 100 new users to receive a 100-point bonus."
    : "You received a 100-point login bonus. Use it to place wagers and keep the profit from winning bets.";

  return (
    <Dialog open onOpenChange={() => setResult(null)}>
      <StencilDialogContent
        kicker={isNew ? `New user bonus · Slot ${result.slot ?? ""}` : "Login bonus"}
        title={title}
        description={BONUS_TERMS}
        footer={
          <button
            type="button"
            onClick={() => setResult(null)}
            className="inline-flex items-center justify-center rounded-md bg-[var(--color-neon)] px-5 py-2.5 text-[13px] font-semibold text-black transition-all hover:brightness-110 active:scale-[0.98]"
          >
            Start playing
          </button>
        }
      />
    </Dialog>
  );
}

export { BONUS_TERMS };
