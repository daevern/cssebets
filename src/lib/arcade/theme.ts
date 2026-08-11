import type { ArcadeGameKey } from "./sound";

/**
 * Per-game visual identity for shared arcade chrome (result pop-up, rules
 * dialog, entrance animation, control dock, HUD plaques). Values mirror each
 * game's own in-page palette so the identity established on the board carries
 * into the chrome.
 * Presentation only — nothing here affects odds, payouts or pacing.
 */
export type ArcadeCabinetDock = {
  /** Top hairline of the console. */
  border: string;
  /** Console background (layered gradient allowed). */
  surface: string;
  /** Primary action background. */
  primaryBg: string;
  /** Primary action label colour. */
  primaryText: string;
  /** Edge stripe used on chips / segment separators. */
  chipEdge: string;
};

export type ArcadeCabinetHud = {
  plaqueBg: string;
  plaqueBorder: string;
  /** Letter-spacing for the micro label above each value. */
  labelTracking: string;
};

export type ArcadeTheme = {
  key: ArcadeGameKey;
  label: string;
  /** Headline / figure accent. */
  accent: string;
  /** Soft glow behind a winning figure. */
  glow: string;
  /** Panel background treatment behind the result figure. */
  backdrop: string;
  /** Stage void behind the playfield. */
  stageBg: string;
  /** Hero surface of the playfield (felt, glass, stone…). */
  feltOrBoardFill: string;
  /** How strongly the shared grain overlay reads on that surface. */
  feltNoiseOpacity: number;
  /** Wood / bezel rail around the playfield. */
  railColor: string;
  /** Metal used for rims, frets and bevels. */
  rimMetal: string;
  dock: ArcadeCabinetDock;
  hud: ArcadeCabinetHud;
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
    stageBg: "linear-gradient(180deg,#0b0f2a 0%,#070a1c 60%,#05060f 100%)",
    feltOrBoardFill: "linear-gradient(180deg,rgba(38,46,120,.55) 0%,rgba(12,16,52,.85) 100%)",
    feltNoiseOpacity: 0.05,
    railColor: "#2a3170",
    rimMetal: "linear-gradient(180deg,#b9c2ff 0%,#5964c9 45%,#2a3170 100%)",
    dock: {
      border: "rgba(143,155,255,.45)",
      surface: "linear-gradient(180deg,#12162f 0%,#0a0d1e 100%)",
      primaryBg: "linear-gradient(180deg,#9aa5ff 0%,#5461e0 100%)",
      primaryText: "#080a18",
      chipEdge: "rgba(143,155,255,.55)",
    },
    hud: {
      plaqueBg: "linear-gradient(180deg,rgba(24,30,70,.92) 0%,rgba(10,13,32,.92) 100%)",
      plaqueBorder: "rgba(143,155,255,.28)",
      labelTracking: "0.22em",
    },
    particles: ["#8f9bff", "#4c5ae0", "#c9d1ff", "#7cc4ff", "#2e38d6"],
  },
  roulette: {
    key: "roulette",
    label: "Roulette",
    accent: "#ffd76a",
    glow: "rgba(10,107,61,.5)",
    backdrop:
      "radial-gradient(80% 70% at 50% 0%, rgba(10,107,61,.42) 0%, rgba(6,58,34,.2) 55%, transparent 100%)",
    stageBg: "linear-gradient(180deg,#0b0f0d 0%,#070a08 100%)",
    feltOrBoardFill: "radial-gradient(120% 90% at 50% 0%,#0e8a4f 0%,#0a6b3d 45%,#064b2b 100%)",
    feltNoiseOpacity: 0.06,
    railColor: "#3f2712",
    rimMetal: "linear-gradient(180deg,#ffe9ab 0%,#d0a447 45%,#6d5017 100%)",
    dock: {
      border: "rgba(255,215,106,.42)",
      surface: "linear-gradient(180deg,#141a16 0%,#0a0d0b 100%)",
      primaryBg: "linear-gradient(180deg,#ffe6a3 0%,#d5a643 55%,#a97e26 100%)",
      primaryText: "#1b1405",
      chipEdge: "rgba(255,215,106,.5)",
    },
    hud: {
      plaqueBg: "linear-gradient(180deg,rgba(19,32,25,.94) 0%,rgba(8,14,11,.94) 100%)",
      plaqueBorder: "rgba(255,215,106,.26)",
      labelTracking: "0.24em",
    },
    particles: ["#ffd76a", "#0a6b3d", "#e8c258", "#c8102e", "#f5f0dc"],
  },
  treasure: {
    key: "treasure",
    label: "Treasure Grid",
    accent: "#e39bff",
    glow: "rgba(183,59,255,.45)",
    backdrop:
      "radial-gradient(80% 70% at 50% 0%, rgba(74,21,134,.45) 0%, rgba(30,8,56,.22) 55%, transparent 100%)",
    stageBg: "linear-gradient(180deg,#150a26 0%,#0a0514 100%)",
    feltOrBoardFill: "linear-gradient(180deg,rgba(74,21,134,.55) 0%,rgba(24,8,44,.9) 100%)",
    feltNoiseOpacity: 0.07,
    railColor: "#3a1560",
    rimMetal: "linear-gradient(180deg,#e9c6ff 0%,#9a4fd6 45%,#3a1560 100%)",
    dock: {
      border: "rgba(227,155,255,.42)",
      surface: "linear-gradient(180deg,#1a1030 0%,#0c0718 100%)",
      primaryBg: "linear-gradient(180deg,#e9a8ff 0%,#a641e0 100%)",
      primaryText: "#160726",
      chipEdge: "rgba(227,155,255,.5)",
    },
    hud: {
      plaqueBg: "linear-gradient(180deg,rgba(38,18,64,.94) 0%,rgba(14,7,26,.94) 100%)",
      plaqueBorder: "rgba(227,155,255,.26)",
      labelTracking: "0.22em",
    },
    particles: ["#e39bff", "#ff49df", "#b73bff", "#8ad3ff", "#ffe1ff"],
  },
  blackjack: {
    key: "blackjack",
    label: "Blackjack",
    accent: "#e0b64a",
    glow: "rgba(22,77,57,.5)",
    backdrop:
      "radial-gradient(80% 70% at 50% 0%, rgba(22,77,57,.45) 0%, rgba(6,34,25,.22) 55%, transparent 100%)",
    stageBg: "linear-gradient(180deg,#080f0c 0%,#050908 100%)",
    feltOrBoardFill: "radial-gradient(120% 90% at 50% 0%,#12померь 0%,#0d5a38 45%,#06301e 100%)",
    feltNoiseOpacity: 0.06,
    railColor: "#3a2413",
    rimMetal: "linear-gradient(180deg,#f3dfa6 0%,#c8a34a 45%,#6a5220 100%)",
    dock: {
      border: "rgba(224,182,74,.42)",
      surface: "linear-gradient(180deg,#0f1a14 0%,#07100c 100%)",
      primaryBg: "linear-gradient(180deg,#f0dda2 0%,#c8a34a 55%,#9c7a2b 100%)",
      primaryText: "#1a1405",
      chipEdge: "rgba(224,182,74,.5)",
    },
    hud: {
      plaqueBg: "linear-gradient(180deg,rgba(15,32,24,.94) 0%,rgba(6,14,10,.94) 100%)",
      plaqueBorder: "rgba(224,182,74,.26)",
      labelTracking: "0.24em",
    },
    particles: ["#e0b64a", "#f0e3bd", "#164d39", "#c8102e", "#ffffff"],
  },
  rps: {
    key: "rps",
    label: "Rock Paper Scissors",
    accent: "#5ce1f2",
    glow: "rgba(92,225,242,.4)",
    backdrop:
      "radial-gradient(80% 70% at 50% 0%, rgba(35,80,96,.42) 0%, rgba(16,32,40,.2) 55%, transparent 100%)",
    stageBg: "linear-gradient(180deg,#08161c 0%,#050b0f 100%)",
    feltOrBoardFill: "linear-gradient(180deg,rgba(28,70,84,.55) 0%,rgba(8,20,26,.9) 100%)",
    feltNoiseOpacity: 0.05,
    railColor: "#123murky",
    rimMetal: "linear-gradient(180deg,#c5f6ff 0%,#4fb6c9 45%,#123642 100%)",
    dock: {
      border: "rgba(92,225,242,.42)",
      surface: "linear-gradient(180deg,#0c1a20 0%,#060d11 100%)",
      primaryBg: "linear-gradient(180deg,#9ef2ff 0%,#3fbdd2 100%)",
      primaryText: "#04161c",
      chipEdge: "rgba(92,225,242,.5)",
    },
    hud: {
      plaqueBg: "linear-gradient(180deg,rgba(14,36,44,.94) 0%,rgba(5,12,16,.94) 100%)",
      plaqueBorder: "rgba(92,225,242,.26)",
      labelTracking: "0.22em",
    },
    particles: ["#5ce1f2", "#dfe6ee", "#7c8899", "#9ef7ff", "#2b3440"],
  },
};

/**
 * Shared grain overlay used to keep hero surfaces from reading as flat hex
 * fills. Inline SVG so it works without any network asset.
 */
export const ARCADE_GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")";
