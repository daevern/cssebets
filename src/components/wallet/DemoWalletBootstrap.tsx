import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { resetDemoWallet } from "@/lib/demo-wallet.functions";
import { useAuth } from "@/hooks/use-auth";

/**
 * Guests (anonymous sessions) get 1,000 demo points on every page load.
 *
 * The reset runs once per browser page load — navigating inside the app keeps
 * the running demo balance, while a refresh or a fresh visit restores 1,000.
 * Demo money lives in the simulation environment, so it never touches the real
 * bankroll, ledgers or house P/L, and it can never be withdrawn.
 */
let didResetThisPageLoad = false;

export function DemoWalletBootstrap() {
  const { user } = useAuth();
  const reset = useServerFn(resetDemoWallet);
  const qc = useQueryClient();
  const isGuest = (user as any)?.is_anonymous === true;

  useEffect(() => {
    if (!isGuest || didResetThisPageLoad) return;
    didResetThisPageLoad = true;
    let active = true;
    (async () => {
      try {
        await reset({});
        if (!active) return;
        qc.invalidateQueries({ queryKey: ["my-wallet"] });
        qc.invalidateQueries({ queryKey: ["my-txns"] });
        qc.invalidateQueries({ queryKey: ["wallet-balance"] });
      } catch (err) {
        // Non-fatal: the guest simply keeps whatever balance the server holds.
        console.error("[demo-wallet] reset failed", err);
        didResetThisPageLoad = false;
      }
    })();
    return () => {
      active = false;
    };
  }, [isGuest, qc, reset]);

  return null;
}

/** True when the current session is an anonymous demo guest. */
export function useIsDemoGuest() {
  const { user } = useAuth();
  return (user as any)?.is_anonymous === true;
}
