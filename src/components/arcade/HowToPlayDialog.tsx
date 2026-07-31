import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type HowToPlayContent = {
  title: string;
  tagline: string;
  steps: string[];
  winning: string[];
  cashout: string;
};

export const HOW_TO_PLAY: Record<"plinko" | "roulette" | "treasure" | "blackjack", HowToPlayContent> = {
  blackjack: {
    title: "How to play Blackjack",
    tagline: "Stake wallet points against the dealer — get closer to 21 without going over.",
    steps: [
      "Pick a chip to set your stake, then press Place bet. The stake leaves your wallet straight away.",
      "You get two cards face up; the dealer gets one up and one down.",
      "Hit to take another card, Stand to stop. Double doubles your stake for exactly one more card, Split turns a pair into two staked hands.",
      "Once you stand (or all hands finish), the dealer reveals and draws to 17. Beat the dealer and the payout lands back in your wallet.",
    ],
    winning: [
      "Bust — going over 21 — loses your stake instantly, so stand on hard 17 or higher.",
      "Two cards making 21 is a natural blackjack and pays 3:2.",
      "Split aces and eights; never split tens. Double when you're on 10 or 11 and the dealer shows a low card.",
    ],
    cashout:
      "Wins pay straight back into your points wallet: 1:1 on a normal win, 3:2 on a natural blackjack, and a push returns your stake.",

  },

  plinko: {
    title: "How to play Plinko",
    tagline: "Drop a ball, let it bounce, land on a multiplier.",
    steps: [
      "Set your stake — this is the amount deducted from your wallet for the drop.",
      "Pick a risk profile and row count. More rows and higher risk stretch the board wider.",
      "Hit Drop. The ball bounces down the pegs and settles in one of the buckets at the bottom.",
      "The bucket you land in multiplies your stake and pays straight back to your wallet.",
    ],
    winning: [
      "Buckets at the outer edges pay the most but are hit the least often.",
      "Centre buckets land far more often but usually pay back less than your stake.",
      "Lower risk keeps results tight around your stake; higher risk swings both ways.",
    ],
    cashout: "There is nothing to cash out mid-round — every drop settles instantly and the payout hits your wallet as soon as the ball lands.",
  },
  roulette: {
    title: "How to play Mini Roulette",
    tagline: "Place chips on the layout, spin the wheel, collect on any bet the ball covers.",
    steps: [
      "Choose your chip size, then tap numbers or outside areas to place bets.",
      "You can stack several bets in one round — each is staked separately.",
      "Hit Spin. The wheel resolves to a single winning pocket.",
      "Every bet that covers the winning pocket pays out; the rest are lost.",
    ],
    winning: [
      "Single numbers pay the most but hit rarely — good for small chips.",
      "Outside bets (colour, odd/even, ranges) hit far more often for smaller returns.",
      "Splits and groups sit in between and let you cover more of the wheel per chip.",
    ],
    cashout: "Clear or undo your chips any time before you press Spin — once the wheel is spinning the round is locked and settles automatically.",
  },
  treasure: {
    title: "How to play Treasure Grid",
    tagline: "Uncover tiles for a rising multiplier — cash out before you hit a trap.",
    steps: [
      "Set your stake and choose how many traps are hidden in the grid.",
      "Tap tiles one at a time. Each safe tile increases your multiplier.",
      "Press Cash Out at any point to bank stake × current multiplier.",
      "Hit a trap and the round ends immediately — the stake is lost.",
    ],
    winning: [
      "More traps means a faster-growing multiplier but a much shorter run.",
      "Set a target number of picks before you start and cash out when you reach it.",
      "The multiplier only counts once you cash out — an uncashed round is worth nothing.",
    ],
    cashout: "Cash Out is live from your first safe tile until you hit a trap. Banked rounds pay to your wallet instantly.",
  },
};

export function HowToPlayDialog({
  open,
  onOpenChange,
  content,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  content: HowToPlayContent;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-black uppercase tracking-[0.14em]">
            {content.title}
          </DialogTitle>
          <DialogDescription>{content.tagline}</DialogDescription>
        </DialogHeader>

        <Section label="The round">
          <ol className="space-y-2">
            {content.steps.map((s, i) => (
              <li key={s} className="flex gap-2 text-sm text-[var(--color-ink)]">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-neon)]/15 text-[10px] font-black text-[var(--color-neon)]">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section label="How to win (and avoid losing)">
          <ul className="space-y-1.5">
            {content.winning.map((s) => (
              <li key={s} className="flex gap-2 text-sm text-[var(--color-ink-muted)]">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--color-neon)]" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section label="Cashing out">
          <p className="text-sm text-[var(--color-ink-muted)]">{content.cashout}</p>
        </Section>
      </DialogContent>
    </Dialog>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface)]/60 p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
        {label}
      </p>
      {children}
    </div>
  );
}
