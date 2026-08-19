import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Demo (guest) wallet.
 *
 * Anonymous visitors play in the platform's SIMULATION environment: their
 * wallet, bets and arcade rounds are booked against the practice bankroll and
 * are excluded from every real accounting, bankroll and P/L report.
 *
 * This resets the guest balance back to exactly 1,000 practice points. The
 * client calls it once per page load, so a refresh always restores 1,000 while
 * navigating inside the app keeps whatever the guest has won or lost.
 */
export const resetDemoWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // The backend can briefly return an HTML gateway error (Cloudflare 520).
    // Retry once, then degrade gracefully instead of crashing the page.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data, error } = await (context.supabase as any).rpc("demo_guest_reset");
        if (!error) return { balance: Number(data ?? 1000), ok: true as const };
        if (attempt === 1) {
          console.error("[demo-wallet] reset failed:", error.message?.slice(0, 200));
        }
      } catch (err) {
        if (attempt === 1) {
          console.error("[demo-wallet] reset threw:", (err as Error)?.message?.slice(0, 200));
        }
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    return { balance: 1000, ok: false as const };
  });

