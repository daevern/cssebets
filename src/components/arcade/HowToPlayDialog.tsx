import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BlackjackArt, PlinkoArt, RouletteArt, RpsArt, TreasureArt } from "./GameArt";
import { CrashArt, DiceArt, HiloArt, KenoArt, PokerArt, TowersArt, WheelArt } from "./MiniGameArt";
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
  keno: KenoArt,
  crash: CrashArt,
  towers: TowersArt,
  poker: PokerArt,
};

export type HowToPlayContent = {
  title: string;
  tagline: string;
  steps: string[];
  winning: string[];
  cashout: string;
};

export const HOW_TO_PLAY: Record<ArcadeGameKey, HowToPlayContent> = {
  towers: {
    title: "How to play Dragon Towers",
    tagline: "Climb eight rows — one tile per row hides a dragon.",
    steps: [
      "Pick a difficulty. Easy hides one dragon behind four tiles; Nightmare hides three behind four.",
      "Set your stake and press Climb. The stake leaves your wallet and the bottom row lights up.",
      "Choose one tile on the live row. A safe tile lifts your multiplier and unlocks the row above.",
      "Press Bank at any time to collect stake x multiplier. Touch a dragon and the climb ends.",
    ],
    winning: [
      "Each safe row multiplies your total by 0.96 x tiles / safe tiles, so harder towers climb faster.",
      "Clearing all eight rows tops the tower out and banks automatically.",
      "The whole dragon layout is fixed by a seed committed before your first pick and revealed when the round ends.",
    ],
    cashout: "Banking settles instantly. A dragon ends the round with no return, and the full tower is revealed so you can verify it.",
  },
  poker: {
    title: "How to play Video Poker",
    tagline: "Jacks or Better — hold what helps, draw the rest.",
    steps: [
      "Set your stake and press Deal. Five cards come off a shuffled 52-card deck.",
      "Tap any cards you want to keep — held cards lift and light up.",
      "Press Draw. Every card you did not hold is replaced from the same deck and the hand is scored.",
    ],
    winning: [
      "A pair of jacks or better pays 1x; the ladder runs up through two pair, trips, straight, flush, full house, quads and straight flush.",
      "A royal flush pays the top 250x.",
      "The whole deck order is fixed by a seed committed before the deal, so your holds cannot change what comes next.",
    ],
    cashout: "Hands settle the moment you draw — the return lands in your points wallet immediately.",
  },
  keno: {
    title: "How to play Keno",
    tagline: "Mark up to ten numbers on a forty-ball board — the house draws ten.",
    steps: [
      "Pick a risk table. Classic pays smaller wins more often; High pays almost nothing until you land a big cluster.",
      "Mark between one and ten numbers, then set your stake. The paytable under the board updates live for the ticket you are holding.",
      "Press Play. Ten balls are drawn from the committed seed and revealed one at a time.",
    ],
    winning: [
      "Your payout depends only on how many of your marked numbers are drawn — position and order never matter.",
      "Every table is built to return 96% of stakes over time, whichever risk you pick.",
      "The top payout on any ticket is capped at 1,000× your stake.",
    ],
    cashout: "Tickets settle instantly — the return lands in your points wallet as soon as the last ball is revealed.",
  },
  crash: {
    title: "How to play Crash",
    tagline: "A multiplier climbs from 1.00× — bank it before the run busts.",
    steps: [
      "Set your stake, and optionally an auto cash-out multiplier.",
      "Press Launch. The stake leaves your wallet and the curve starts climbing immediately.",
      "Hit Cash out before the run busts. The multiplier is read from the server clock, so the payout is the same wherever you are.",
    ],
    winning: [
      "Your return is your stake multiplied by the multiplier you banked.",
      "The bust point is fixed by a seed committed before you launch — it never reacts to your cash-out.",
      "The chance of surviving to any multiplier is 0.96 ÷ that multiplier, which is what holds the 96% return.",
      "Runs top out at 100× — reaching the cap pays the cap.",
    ],
    cashout: "An auto cash-out settles for you the moment the curve touches your target, even if you lose connection. Runs left open are settled by the server at their true outcome.",
  },
  hilo: {
    title: "How to play Hi-Lo",
    tagline: "Deal a reference card, call higher or lower, and climb the multiplier ladder.",
    steps: [
      "Set your stake and press Deal. The stake leaves your wallet and the first card is turned over on the felt.",
      "Each call pad shows its real chance and the step multiplier. Higher means higher or equal; Lower means strictly lower.",
      "Call correctly and the new card becomes the reference, with your climb compounding.",
      "Press Bank at any time to collect stake × multiplier. One wrong call ends the run.",
    ],
    winning: [
      "The pads always add up to the whole deck, so one side is safe and cheap, the other risky and rich.",
      "Calling the likelier side repeatedly grows slowly but survives far longer.",
      "The run is capped at 25×, at which point it banks automatically.",
    ],
    cashout:
      "Banking pays stake × current multiplier straight into your points wallet. An uncollected run is worth nothing, so bank before you get greedy.",
  },
  dice: {
    title: "How to play Dice",
    tagline: "Tune the win band on the roll machine, then let the dial settle 0.00–99.99.",
    steps: [
      "Set your stake with the chips.",
      "Choose Under or Over, then drag the target — the green band on the track is where you need to land.",
      "Win chance and payout update live on the instrument plaques.",
      "Press Roll. The dial scrambles, then the marker slides to the server roll.",
    ],
    winning: [
      "Every target pays exactly 96% of fair odds, so no target is better value than another.",
      "Wide bands (like under 90) win most rolls for a small return.",
      "Narrow bands pay up to 48× but hit rarely — size your stake accordingly.",
    ],
    cashout:
      "There is nothing to cash out — each roll settles the moment it resolves and pays straight to your points wallet.",
  },
  wheel: {
    title: "How to play Fortune Wheel",
    tagline: "Twenty equal segments on a cabinet wheel — pick your risk table and spin.",
    steps: [
      "Set your stake, then choose Low, Medium or High risk.",
      "The cabinet shows the exact segment table you're spinning against.",
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
