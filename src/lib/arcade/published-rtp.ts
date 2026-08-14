/**
 * Player-facing RTP / fairness labels for arcade HUD chrome.
 * Presentation only — never used to compute payouts.
 */
import type { ArcadeGameKey } from "@/lib/arcade/sound";
import {
  BLACKJACK_RULESETS,
  PLINKO_TARGETS,
  RPS_CONFIGS,
  plinkoRtp,
  type ConfigVersion,
  type PlinkoRisk,
  type PlinkoRows,
} from "@/lib/arcade/config-registry";
import { THEORETICAL_RTP } from "@/lib/arcade/roulette-math";
import { DEFAULT_TARGET_RTP } from "@/lib/arcade/treasure-math";
import { MINI_TARGET_RTP } from "@/lib/arcade/mini-math";

export type FairnessInfo = {
  /** Short plaque value, e.g. "97.3%" */
  rtpLabel: string;
  /** Micro copy under/beside it */
  tag: string;
};

function pct(n: number): string {
  return `${(n * 100).toFixed(n >= 0.99 ? 1 : 1)}%`;
}

export function arcadeFairness(
  game: ArcadeGameKey,
  opts?: {
    version?: ConfigVersion;
    rows?: PlinkoRows;
    risk?: PlinkoRisk;
  },
): FairnessInfo {
  const version = opts?.version ?? 2;

  switch (game) {
    case "roulette":
      return { rtpLabel: pct(THEORETICAL_RTP), tag: "Provably fair" };
    case "treasure":
      return { rtpLabel: pct(DEFAULT_TARGET_RTP), tag: "Provably fair" };
    case "rps":
      return {
        rtpLabel: pct(RPS_CONFIGS[version].targetRtp),
        tag: "Provably fair",
      };
    case "blackjack":
      return {
        rtpLabel: pct(BLACKJACK_RULESETS[version].measuredRtp),
        tag: "Provably fair",
      };
    case "plinko": {
      if (opts?.rows != null && opts?.risk != null) {
        return {
          rtpLabel: pct(plinkoRtp(opts.rows, opts.risk, version)),
          tag: "Provably fair",
        };
      }
      return {
        rtpLabel: pct(PLINKO_TARGETS[version].targetRtp),
        tag: "Provably fair",
      };
    }
    case "hilo":
    case "dice":
    case "wheel":
      return { rtpLabel: pct(MINI_TARGET_RTP), tag: "Provably fair" };
  }
}
