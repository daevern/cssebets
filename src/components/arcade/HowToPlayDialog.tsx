import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BlackjackArt, PlinkoArt, RouletteArt, RpsArt, TreasureArt } from "./GameArt";
import { DiceArt, HiloArt, WheelArt } from "./MiniGameArt";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import type { ArcadeGameKey } from "@/lib/arcade/sound";

/** Lobby art reused inside the rules dialog so each game keeps its identity. */
const GAME_ART: Record<ArcadeGameKey, () => ReactNode> = {
  plinko: PlinkoArt,
  roulette: RouletteArt,
  treasure: TreasureArt,
  blackjack: BlackjackArt,
  rps: RpsArt,
  hilo: HiloArt,
  dice: DiceArt,
  wheel: WheelArt,
};

export type HowToPlayContent = {
  title: string;
  tagline: string;
  steps: string[];
  winning: string[];
  cashout: string;
};

export const HOW_TO_PLAY: Record<ArcadeGameKey, HowToPlayContent> = {
  hilo: {
    title: "How to play Hi-Lo",
    tagline: "Call the next card higher or lower — every correct call grows your multiplier.",
    steps: [
      "Set your stake and press Deal. The stake leaves your wallet and the first card is turned over.",
      "Each button shows its real chance and the multiplier it pays. Higher means higher or equal; Lower means strictly lower.",
      "Call correctly and the new card becomes the reference card, with your multiplier compounding.",
      "Press Collect at any time to bank stake × multiplier. One wrong call ends the run.",
    ],
    winning: [
      "The buttons always add up to the whole deck, so one side is safe and cheap, the other risky and rich.",
      "Calling the likelier side repeatedly grows slowly but survives far longer.",
      "The run is capped at 25×, at which point it banks automatically.",
    ],
    cashout:
      "Collect banks stake × current multiplier straight into your points wallet. An uncollected run is worth nothing, so bank before you get greedy.",
  },
  dice: {
    title: "How to play Dice",
    tagline: "Pick a target, pick a side, and the server rolls 0.00–99.99.",
    steps: [
      "Set your stake with the chips or the stake field.",
      "Drag the slider to choose your target number, and switch between Roll under and Roll over.",
      "The win chance and payout update live — a tighter target pays more but lands less often.",
      "Press Roll. The result settles instantly and any win is credited to your wallet.",
    ],
    winning: [
      "Every target pays exactly 96% of fair odds, so no target is better value than another.",
      "Wide targets (like under 90) win most rolls for a small return.",
      "Narrow targets pay up to 48× but hit rarely — size your stake accordingly.",
    ],
    cashout:
      "There is nothing to cash out — each roll settles the moment it resolves and pays straight to your points wallet.",
  },
  wheel: {
    title: "How to play Fortune Wheel",
    tagline: "Twenty equal segments, one pointer — pick your risk and spin.",
    steps: [
      "Set your stake, then choose Low, Medium or High risk.",
      "The wheel below shows the exact segment table you're spinning against.",
      "Press Spin. The winning segment is fixed by the committed seed before the wheel even moves.",
      "The segment under the pointer multiplies your stake and pays into your wallet.",
    ],
    winning: [
      "Every segment is equally likely — the pointer has no bias.",
      "Low risk returns something on most spins; high risk is mostly zeros with a 15× top prize.",
      "All three risk tables pay the same 96% over time, so pick the swing you enjoy.",
    ],
    cashout:
      "Each spin settles on its own — the payout lands in your points wallet as soon as the wheel stops.",
  },

  rps: {
    title: "How to play Rock–Paper–Scissors",
    tagline: "The computer locks its move before you pick — both hands reveal at the same moment.",
    steps: [
      "Pick a chip to set your stake. The computer's move is already committed and its fingerprint is shown on screen.",
      "Choose Rock, Paper or Scissors. Your choice locks instantly and cannot be changed.",
      "Both hands reveal together — the computer's move was fixed before you touched a button.",
      "Wins and draws pay straight back into your points wallet.",
    ],
    winning: [
      "Rock beats Scissors, Scissors beats Paper, Paper beats Rock.",
      "A draw returns your stake, so only a loss costs you points.",
      "Every round is independent — the computer has no memory of your last pick.",
    ],
    cashout:
      "There is nothing to cash out: each round settles the moment both hands reveal. Tap Verify to re-derive the computer's move in your own browser from the published fingerprint.",
  },

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
    title: "How to play Roulette",
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
  game,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  content: HowToPlayContent;
  /** Renders that game's lobby art at the top of the dialog. */
  game?: ArcadeGameKey;
}) {
  const Art = game ? GAME_ART[game] : null;
  const theme = game ? ARCADE_THEMES[game] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {Art && (
          <div
            aria-hidden
            className="relative -mx-6 -mt-6 mb-1 h-28 overflow-hidden sm:h-32"
            style={{ background: theme?.backdrop }}
          >
            <div className="pointer-events-none absolute inset-0 [&>*]:h-full [&>*]:w-full">
              <Art />
            </div>
          </div>
        )}
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
