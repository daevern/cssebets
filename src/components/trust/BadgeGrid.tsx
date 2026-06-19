import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyBadges } from "@/lib/trust.functions";
import { StencilPanel } from "@/components/ui/page-shell";
import { IconBadge } from "@/components/trust/TrustIcons";

type B = { key: keyof Awaited<ReturnType<typeof useBadges>>["data"] & string; title: string; sub: string };

function useBadges() {
  const fn = useServerFn(getMyBadges);
  return useQuery({ queryKey: ["trust", "my-badges"], queryFn: () => fn({}), staleTime: 60_000 });
}

const BADGES = [
  { key: "verified_member", title: "Verified", sub: "Funded account" },
  { key: "first_bet", title: "First Bet", sub: "1 bet placed" },
  { key: "ten_bets", title: "Regular", sub: "10 bets placed" },
  { key: "hundred_bets", title: "Veteran", sub: "100 bets placed" },
  { key: "winning_streak", title: "On a Roll", sub: "3 wins" },
  { key: "payout_completed", title: "Cashed Out", sub: "Payout received" },
] as const;

export function BadgeGrid() {
  const q = useBadges();
  const d = q.data;

  return (
    <StencilPanel kicker={<><IconBadge className="h-3 w-3" /> Member Achievements</>}>
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {BADGES.map((b) => {
          const earned = d ? Boolean((d as Record<string, unknown>)[b.key]) : false;
          return (
            <div
              key={b.key}
              className={`relative border bg-[#070D0A] p-3 text-center ${
                earned
                  ? "border-[var(--color-neon)]/40"
                  : "border-dashed border-[var(--color-surface-border)] opacity-60"
              }`}
            >
              <IconBadge
                className={`mx-auto h-7 w-7 ${earned ? "text-[var(--color-neon)]" : "text-[var(--color-ink-muted)]"}`}
              />
              <div className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink)]">
                {b.title}
              </div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                {b.sub}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
        Badges are awarded automatically from real account activity.
      </p>
    </StencilPanel>
  );
}
