/**
 * Blackjack hand-value engine (client mirror).
 *
 * The server is authoritative — this exists only so the UI can render totals
 * instantly. It intentionally uses exactly the same rules as the Postgres
 * `arcade_bj_value` function: aces count 11 and are demoted to 1 while the
 * total busts.
 */

export type Rank = number; // 1 = Ace, 11 = Jack, 12 = Queen, 13 = King
export type Suit = 0 | 1 | 2 | 3; // clubs, diamonds, hearts, spades

export const SUIT_SYMBOLS = ["\u2663", "\u2666", "\u2665", "\u2660"] as const;
export const RANK_LABELS = [
  "",
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;

export function rankLabel(rank: Rank): string {
  return RANK_LABELS[rank] ?? "?";
}

export function suitSymbol(suit: Suit | number): string {
  return SUIT_SYMBOLS[suit as Suit] ?? "?";
}

export function isRedSuit(suit: Suit | number): boolean {
  return suit === 1 || suit === 2;
}

/** Short human label for a card, e.g. "A♠". */
export function cardLabel(rank: Rank, suit: Suit | number): string {
  return `${rankLabel(rank)}${suitSymbol(suit)}`;
}

export type HandValue = {
  total: number;
  soft: boolean;
  bust: boolean;
};

export function handValue(ranks: Rank[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const r of ranks) {
    if (r === 1) {
      aces += 1;
      total += 11;
    } else if (r >= 10) {
      total += 10;
    } else {
      total += r;
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0, bust: total > 21 };
}

export function isBlackjack(ranks: Rank[]): boolean {
  return ranks.length === 2 && handValue(ranks).total === 21;
}

export function formatTotal(v: HandValue): string {
  if (v.bust) return `${v.total}`;
  return v.soft ? `${v.total - 10}/${v.total}` : `${v.total}`;
}
