import type { CSSProperties } from "react";
import type { ArcadeGameKey } from "./sound";

/**
 * Per-game visual identity for shared arcade chrome.
 * Clean flat 2D — solid fills, hairline borders, no faux-3D materials.
 * Presentation only — nothing here affects odds, payouts or pacing.
 */
export type ArcadeCabinetDock = {
  border: string;
  surface: string;
  primaryBg: string;
  primaryText: string;
  chipEdge: string;
};

export type ArcadeCabinetHud = {
  plaqueBg: string;
  plaqueBorder: string;
  labelTracking: string;
};

export type ArcadeTheme = {
  key: ArcadeGameKey;
  label: string;
  accent: string;
  /** Soft tint used sparingly for win emphasis (not a blur glow). */
  glow: string;
  backdrop: string;
  stageBg: string;
  feltOrBoardFill: string;
  /** Kept for API compat; flat mode always uses 0. */
  feltNoiseOpacity: number;
  railColor: string;
  rimMetal: string;
  dock: ArcadeCabinetDock;
  hud: ArcadeCabinetHud;
  particles: string[];
};

export const ARCADE_THEMES: Record<ArcadeGameKey, ArcadeTheme> = {
  plinko: {
    key: "plinko",
    label: "Plinko",
    accent: "#8f9bff",
    glow: "rgba(143,155,255,.2)",
    backdrop: "transparent",
    stageBg: "#0a0d18",
    feltOrBoardFill: "#12182e",
    feltNoiseOpacity: 0,
    railColor: "#1e2648",
    rimMetal: "#6b76c4",
    dock: {
      border: "rgba(143,155,255,.35)",
      surface: "#0c101c",
      primaryBg: "#8f9bff",
      primaryText: "#080a18",
      chipEdge: "rgba(143,155,255,.4)",
    },
    hud: {
      plaqueBg: "#12182e",
      plaqueBorder: "rgba(143,155,255,.22)",
      labelTracking: "0.18em",
    },
    particles: ["#8f9bff", "#4c5ae0", "#c9d1ff", "#7cc4ff"],
  },
  roulette: {
    key: "roulette",
    label: "Roulette",
    accent: "#e8c258",
    glow: "rgba(232,194,88,.18)",
    backdrop: "transparent",
    stageBg: "#0a0e0c",
    feltOrBoardFill: "#0a6b3d",
    feltNoiseOpacity: 0,
    railColor: "#2a1c10",
    rimMetal: "#c9a24a",
    dock: {
      border: "rgba(232,194,88,.35)",
      surface: "#0c1210",
      primaryBg: "#e8c258",
      primaryText: "#1b1405",
      chipEdge: "rgba(232,194,88,.4)",
    },
    hud: {
      plaqueBg: "#121a16",
      plaqueBorder: "rgba(232,194,88,.22)",
      labelTracking: "0.18em",
    },
    particles: ["#e8c258", "#0a6b3d", "#c8102e", "#f5f0dc"],
  },
  treasure: {
    key: "treasure",
    label: "Treasure Grid",
    accent: "#d89bff",
    glow: "rgba(216,155,255,.18)",
    backdrop: "transparent",
    stageBg: "#10081a",
    feltOrBoardFill: "#1a0e2a",
    feltNoiseOpacity: 0,
    railColor: "#2a1548",
    rimMetal: "#9a4fd6",
    dock: {
      border: "rgba(216,155,255,.35)",
      surface: "#120a1c",
      primaryBg: "#d89bff",
      primaryText: "#160726",
      chipEdge: "rgba(216,155,255,.4)",
    },
    hud: {
      plaqueBg: "#1a0e2a",
      plaqueBorder: "rgba(216,155,255,.22)",
      labelTracking: "0.18em",
    },
    particles: ["#d89bff", "#b73bff", "#8ad3ff", "#ffe1ff"],
  },
  blackjack: {
    key: "blackjack",
    label: "Blackjack",
    accent: "#d4b05a",
    glow: "rgba(212,176,90,.18)",
    backdrop: "transparent",
    stageBg: "#0a100e",
    feltOrBoardFill: "#0d5a38",
    feltNoiseOpacity: 0,
    railColor: "#2a1c10",
    rimMetal: "#c8a34a",
    dock: {
      border: "rgba(212,176,90,.35)",
      surface: "#0c1410",
      primaryBg: "#d4b05a",
      primaryText: "#1a1405",
      chipEdge: "rgba(212,176,90,.4)",
    },
    hud: {
      plaqueBg: "#121c18",
      plaqueBorder: "rgba(212,176,90,.22)",
      labelTracking: "0.18em",
    },
    particles: ["#d4b05a", "#164d39", "#c8102e", "#ffffff"],
  },
  rps: {
    key: "rps",
    label: "Rock Paper Scissors",
    accent: "#5ce1f2",
    glow: "rgba(92,225,242,.16)",
    backdrop: "transparent",
    stageBg: "#081218",
    feltOrBoardFill: "#0e2430",
    feltNoiseOpacity: 0,
    railColor: "#123642",
    rimMetal: "#4fb6c9",
    dock: {
      border: "rgba(92,225,242,.35)",
      surface: "#0a1418",
      primaryBg: "#5ce1f2",
      primaryText: "#04161c",
      chipEdge: "rgba(92,225,242,.4)",
    },
    hud: {
      plaqueBg: "#0e1e24",
      plaqueBorder: "rgba(92,225,242,.22)",
      labelTracking: "0.18em",
    },
    particles: ["#5ce1f2", "#dfe6ee", "#7c8899", "#9ef7ff"],
  },
  hilo: {
    key: "hilo",
    label: "Hi-Lo",
    accent: "#f2a65a",
    glow: "rgba(242,166,90,.16)",
    backdrop: "transparent",
    stageBg: "#120c07",
    feltOrBoardFill: "#1e1409",
    feltNoiseOpacity: 0,
    railColor: "#33210f",
    rimMetal: "#c98a3c",
    dock: {
      border: "rgba(242,166,90,.35)",
      surface: "#140e08",
      primaryBg: "#f2a65a",
      primaryText: "#1c1004",
      chipEdge: "rgba(242,166,90,.4)",
    },
    hud: {
      plaqueBg: "#1e1409",
      plaqueBorder: "rgba(242,166,90,.22)",
      labelTracking: "0.18em",
    },
    particles: ["#f2a65a", "#c8102e", "#f7efdd", "#8a5a22"],
  },
  dice: {
    key: "dice",
    label: "Dice",
    accent: "#4ade9a",
    glow: "rgba(74,222,154,.16)",
    backdrop: "transparent",
    stageBg: "#06120e",
    feltOrBoardFill: "#0c2019",
    feltNoiseOpacity: 0,
    railColor: "#123329",
    rimMetal: "#3fae7c",
    dock: {
      border: "rgba(74,222,154,.35)",
      surface: "#08150f",
      primaryBg: "#4ade9a",
      primaryText: "#04170e",
      chipEdge: "rgba(74,222,154,.4)",
    },
    hud: {
      plaqueBg: "#0c2019",
      plaqueBorder: "rgba(74,222,154,.22)",
      labelTracking: "0.18em",
    },
    particles: ["#4ade9a", "#ffffff", "#1d7a53", "#a7f3d0"],
  },
  wheel: {
    key: "wheel",
    label: "Fortune Wheel",
    accent: "#ff6b6b",
    glow: "rgba(255,107,107,.16)",
    backdrop: "transparent",
    stageBg: "#140810",
    feltOrBoardFill: "#221019",
    feltNoiseOpacity: 0,
    railColor: "#3a1520",
    rimMetal: "#d15353",
    dock: {
      border: "rgba(255,107,107,.35)",
      surface: "#160a11",
      primaryBg: "#ff6b6b",
      primaryText: "#210608",
      chipEdge: "rgba(255,107,107,.4)",
    },
    hud: {
      plaqueBg: "#221019",
      plaqueBorder: "rgba(255,107,107,.22)",
      labelTracking: "0.18em",
    },
    particles: ["#ff6b6b", "#f6e2b3", "#8c2f3a", "#ffd6d6"],
  },
};

/** Unused in flat mode; kept so older call sites compile. */
export const ARCADE_GRAIN_URL = "none";

/** CSS custom properties for house chrome — set on `[data-arcade-game]`. */
export function arcadeCssVars(game: ArcadeGameKey): CSSProperties {
  const t = ARCADE_THEMES[game];
  return {
    ["--arcade-accent" as string]: t.accent,
    ["--arcade-stage" as string]: t.stageBg,
    ["--arcade-felt" as string]: t.feltOrBoardFill,
    ["--arcade-plaque-bg" as string]: t.hud.plaqueBg,
    ["--arcade-plaque-border" as string]: t.hud.plaqueBorder,
    ["--arcade-dock-surface" as string]: t.dock.surface,
    ["--arcade-dock-border" as string]: t.dock.border,
    ["--arcade-primary" as string]: t.dock.primaryBg,
    ["--arcade-primary-text" as string]: t.dock.primaryText,
    ["--arcade-label-tracking" as string]: t.hud.labelTracking,
  };
}
