import * as React from "react";
import type { ArcadeGameKey } from "@/lib/arcade/sound";

/**
 * Flat 2D mode: no ambient blur spill / cabinet lighting.
 * Components kept so call sites don't need a sweep — they render nothing.
 */
export function ArcadeGlow(_props: {
  game: ArcadeGameKey;
  className?: string;
}) {
  return null;
}

export function CabinetLight(_props: {
  game: ArcadeGameKey;
  className?: string;
}) {
  return null;
}
