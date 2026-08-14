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
    accent: "#00e701",
    glow: "rgba(0,231,1,.16)",
    backdrop: "transparent",
    stageBg: "#0f212e",
    feltOrBoardFill: "#213743",
    feltNoiseOpacity: 0,
    railColor: "#2f4553",
    rimMetal: "#557086",
    dock: {
      border: "rgba(0,231,1,.3)",
      surface: "#0f212e",
      primaryBg: "#00e701",
      primaryText: "#03210a",
      chipEdge: "rgba(0,231,1,.4)",
    },
    hud: {
      plaqueBg: "#213743",
      plaqueBorder: "rgba(255,255,255,.1)",
      labelTracking: "0.18em",
    },
    particles: ["#00e701", "#ffffff", "#2f4553", "#7bffb0"],
  },
  treasure: {
    key: "treasure",
    label: "Treasure Grid",
    accent: "#00e701",
    glow: "rgba(0,231,1,.16)",
    backdrop: "transparent",
    stageBg: "#0f212e",
    feltOrBoardFill: "#213743",
    feltNoiseOpacity: 0,
    railColor: "#2f4553",
    rimMetal: "#557086",
    dock: {
      border: "rgba(0,231,1,.3)",
      surface: "#0f212e",
      primaryBg: "#00e701",
      primaryText: "#03210a",
      chipEdge: "rgba(0,231,1,.4)",
    },
    hud: {
      plaqueBg: "#213743",
      plaqueBorder: "rgba(255,255,255,.1)",
      labelTracking: "0.18em",
    },
    particles: ["#00e701", "#ffffff", "#2f4553", "#7bffb0"],
  },
  blackjack: {
    key: "blackjack",
    label: "Blackjack",
    accent: "#00e701",
    glow: "rgba(0,231,1,.16)",
    backdrop: "transparent",
    stageBg: "#0f212e",
    feltOrBoardFill: "#213743",
    feltNoiseOpacity: 0,
    railColor: "#2f4553",
    rimMetal: "#557086",
    dock: {
      border: "rgba(255,255,255,.08)",
      surface: "#0f212e",
      primaryBg: "#00e701",
      primaryText: "#03210a",
      chipEdge: "rgba(0,231,1,.4)",
    },
    hud: {
      plaqueBg: "#213743",
      plaqueBorder: "rgba(255,255,255,.1)",
      labelTracking: "0.18em",
    },
    particles: ["#00e701", "#ffffff", "#2f4553", "#7bffb0"],
  },
  rps: {
    key: "rps",
    label: "Rock Paper Scissors",
    accent: "#00e701",
    glow: "rgba(0,231,1,.16)",
    backdrop: "transparent",
    stageBg: "#0f212e",
    feltOrBoardFill: "#213743",
    feltNoiseOpacity: 0,
    railColor: "#1a2c3a",
    rimMetal: "#2f4553",
    dock: {
      border: "rgba(255,255,255,.08)",
      surface: "#0f212e",
      primaryBg: "#00e701",
      primaryText: "#04140a",
      chipEdge: "rgba(255,255,255,.08)",
    },

    hud: {
      plaqueBg: "#0f212e",
      plaqueBorder: "rgba(255,255,255,.08)",
      labelTracking: "0.18em",
    },
    particles: ["#00e701", "#dfe6ee", "#7c8899", "#b9ffc2"],
  },
  hilo: {
    key: "hilo",
    label: "Hi-Lo",
    accent: "#00e701",
    glow: "rgba(0,231,1,.16)",
    backdrop: "transparent",
    stageBg: "#0f212e",
    feltOrBoardFill: "#213743",
    feltNoiseOpacity: 0,
    railColor: "#2f4553",
    rimMetal: "#557086",
    dock: {
      border: "rgba(0,231,1,.3)",
      surface: "#0f212e",
      primaryBg: "#00e701",
      primaryText: "#03210a",
      chipEdge: "rgba(0,231,1,.4)",
    },
    hud: {
      plaqueBg: "#213743",
      plaqueBorder: "rgba(255,255,255,.1)",
      labelTracking: "0.18em",
    },
    particles: ["#00e701", "#ffffff", "#2f4553", "#7bffb0"],
  },

  dice: {
    key: "dice",
    label: "Dice",
    accent: "#00e701",
    glow: "rgba(0,231,1,.16)",
    backdrop: "transparent",
    stageBg: "#0f212e",
    feltOrBoardFill: "#213743",
    feltNoiseOpacity: 0,
    railColor: "#2f4553",
    rimMetal: "#557086",
    dock: {
      border: "rgba(0,231,1,.3)",
      surface: "#0f212e",
      primaryBg: "#00e701",
      primaryText: "#03210a",
      chipEdge: "rgba(0,231,1,.4)",
    },
    hud: {
      plaqueBg: "#213743",
      plaqueBorder: "rgba(255,255,255,.1)",
      labelTracking: "0.18em",
    },
    particles: ["#00e701", "#ffffff", "#2f4553", "#7bffb0"],
  },
  wheel: {
    key: "wheel",
    label: "Fortune Wheel",
    accent: "#00e701",
    glow: "rgba(0,231,1,.16)",
    backdrop: "transparent",
    stageBg: "#0f212e",
    feltOrBoardFill: "#213743",
    feltNoiseOpacity: 0,
    railColor: "#2f4553",
    rimMetal: "#557086",
    dock: {
      border: "rgba(0,231,1,.3)",
      surface: "#0f212e",
      primaryBg: "#00e701",
      primaryText: "#03210a",
      chipEdge: "rgba(0,231,1,.4)",
    },
    hud: {
      plaqueBg: "#213743",
      plaqueBorder: "rgba(255,255,255,.1)",
      labelTracking: "0.18em",
    },
    particles: ["#00e701", "#ffffff", "#2f4553", "#7bffb0"],
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
