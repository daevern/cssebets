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
    const { data, error } = await (context.supabase as any).rpc("demo_guest_reset");
    if (error) throw new Error(error.message);
    return { balance: Number(data ?? 1000) };
  });
