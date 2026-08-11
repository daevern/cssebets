import type { ArcadeGameKey } from "./sound";

/**
 * Per-game visual identity for shared arcade chrome (result pop-up, rules
 * dialog, entrance animation). Values mirror each game's own in-page palette
 * so the identity established on the board carries into the chrome.
 * Presentation only — nothing here affects odds, payouts or pacing.
 */
export type ArcadeTheme = {
  key: ArcadeGameKey;
  label: string;
  /** Headline / figure accent. */
  accent: string;
  /** Soft glow behind a winning figure. */
  glow: string;
  /** Panel background treatment behind the result figure. */
  backdrop: string;
  /** Confetti palette. */
  particles: string[];
};

export const ARCADE_THEMES: Record<ArcadeGameKey, ArcadeTheme> = {
  plinko: {
    key: "plinko",
    label: "Plinko",
    accent: "#8f9bff",
    glow: "rgba(70,84,235,.45)",
    backdrop:
      "radial-gradient(80% 70% at 50% 0%, rgba(46,56,214,.34) 0%, rgba(15,20,102,.18) 55%, transparent 100%)",
    particles: ["#8f9bff", "#4c5ae0", "#c9d1ff", "#7cc4ff", "#2e38d6"],
  },
  roulette: {
    key: "roulette",
    label: "Roulette",
    accent: "#ffd76a",
    glow: "rgba(10,107,61,.5)",
    backdrop:
      "radial-gradient(80% 70% at 50% 0%, rgba(10,107,61,.42) 0%, rgba(6,58,34,.2) 55%, transparent 100%)",
    particles: ["#ffd76a", "#0a6b3d", "#e8c258", "#c8102e", "#f5f0dc"],
  },
  treasure: {
    key: "treasure",
    label: "Treasure Grid",
    accent: "#e39bff",
    glow: "rgba(183,59,255,.45)",
    backdrop:
      "radial-gradient(80% 70% at 50% 0%, rgba(74,21,134,.45) 0%, rgba(30,8,56,.22) 55%, transparent 100%)",
    particles: ["#e39bff", "#ff49df", "#b73bff", "#8ad3ff", "#ffe1ff"],
  },
  blackjack: {
    key: "blackjack",
    label: "Blackjack",
    accent: "#e0b64a",
    glow: "rgba(22,77,57,.5)",
    backdrop:
      "radial-gradient(80% 70% at 50% 0%, rgba(22,77,57,.45) 0%, rgba(6,34,25,.22) 55%, transparent 100%)",
    particles: ["#e0b64a", "#f0e3bd", "#164d39", "#c8102e", "#ffffff"],
  },
  rps: {
    key: "rps",
    label: "Rock Paper Scissors",
    accent: "#5ce1f2",
    glow: "rgba(92,225,242,.4)",
    backdrop:
      "radial-gradient(80% 70% at 50% 0%, rgba(35,80,96,.42) 0%, rgba(16,32,40,.2) 55%, transparent 100%)",
    particles: ["#5ce1f2", "#dfe6ee", "#7c8899", "#9ef7ff", "#2b3440"],
  },
};
