import * as React from "react";

/**
 * Tiny arcade sound engine.
 *
 * Presentation only — nothing here touches game state, RNG or payouts.
 * Short SFX are preloaded from /sfx and played through small pools of
 * HTMLAudioElements so overlapping hits (chip clacks, coin cascades) never
 * cut each other off.
 */

export const SFX_NAMES = [
  "chip",
  "spin-start",
  "reveal-tick",
  "win-small",
  "win-big",
  "win-mega",
  "loss",
  "button",
  "collect",
] as const;

export type SfxName = (typeof SFX_NAMES)[number];

const STORAGE_KEY = "arcade_sound_muted";
const POOL_SIZE = 4;

/** Per-sound base volume so nothing overpowers the rest of the mix. */
const VOLUMES: Record<SfxName, number> = {
  chip: 0.5,
  "spin-start": 0.45,
  "reveal-tick": 0.4,
  "win-small": 0.5,
  "win-big": 0.6,
  "win-mega": 0.7,
  loss: 0.45,
  button: 0.3,
  collect: 0.55,
};

type PlayOptions = {
  /** Playback rate, e.g. rising pitch on a win ladder. */
  rate?: number;
  /** Multiplier on the sound's base volume. */
  volume?: number;
};

class ArcadeSoundEngine {
  private pools = new Map<SfxName, HTMLAudioElement[]>();
  private cursors = new Map<SfxName, number>();
  private listeners = new Set<() => void>();
  private armed = false;
  private loaded = false;
  muted = false;

  constructor() {
    if (typeof window === "undefined") return;
    try {
      this.muted = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      this.muted = false;
    }
  }

  /** Preload every clip; safe to call repeatedly. */
  load() {
    if (this.loaded || typeof window === "undefined") return;
    this.loaded = true;
    for (const name of SFX_NAMES) {
      const pool: HTMLAudioElement[] = [];
      for (let i = 0; i < POOL_SIZE; i++) {
        const el = new Audio(`/sfx/${name}.mp3`);
        el.preload = "auto";
        el.volume = VOLUMES[name];
        pool.push(el);
      }
      this.pools.set(name, pool);
      this.cursors.set(name, 0);
    }
    this.installArmListeners();
  }

  /**
   * Browsers block audio until the page has seen a user gesture. The first
   * pointer/key press plays a silent primer so later, code-triggered sounds
   * (a ball landing, a card flipping) are allowed through.
   */
  private installArmListeners() {
    if (typeof window === "undefined") return;
    const arm = () => {
      if (this.armed) return;
      this.armed = true;
      for (const pool of this.pools.values()) {
        const el = pool[0];
        const vol = el.volume;
        el.volume = 0;
        el.play()
          .then(() => {
            el.pause();
            el.currentTime = 0;
            el.volume = vol;
          })
          .catch(() => {
            el.volume = vol;
          });
      }
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
      window.removeEventListener("touchstart", arm);
    };
    window.addEventListener("pointerdown", arm, { passive: true });
    window.addEventListener("touchstart", arm, { passive: true });
    window.addEventListener("keydown", arm);
  }

  play(name: SfxName, opts: PlayOptions = {}) {
    if (this.muted || typeof window === "undefined") return;
    this.load();
    const pool = this.pools.get(name);
    if (!pool) return;
    const i = this.cursors.get(name) ?? 0;
    this.cursors.set(name, (i + 1) % pool.length);
    const el = pool[i];
    try {
      el.pause();
      el.currentTime = 0;
      el.playbackRate = Math.min(3, Math.max(0.5, opts.rate ?? 1));
      el.volume = Math.min(1, Math.max(0, VOLUMES[name] * (opts.volume ?? 1)));
      void el.play().catch(() => {});
    } catch {
      /* audio is a nicety — never let it break a round */
    }
  }

  setMuted(next: boolean) {
    this.muted = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* private mode */
    }
    if (next) {
      for (const pool of this.pools.values()) {
        for (const el of pool) {
          el.pause();
          el.currentTime = 0;
        }
      }
    }
    this.listeners.forEach((l) => l());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getMuted = () => this.muted;
}

export const arcadeSound = new ArcadeSoundEngine();

/** Pick the win tier sound for a payout ratio (payout ÷ stake). */
export function winSfxForRatio(ratio: number): SfxName {
  if (ratio > 10) return "win-mega";
  if (ratio >= 3) return "win-big";
  return "win-small";
}

export function useArcadeSound() {
  const muted = React.useSyncExternalStore(
    arcadeSound.subscribe,
    arcadeSound.getMuted,
    () => false,
  );

  React.useEffect(() => {
    arcadeSound.load();
  }, []);

  const play = React.useCallback((name: SfxName, opts?: PlayOptions) => {
    arcadeSound.play(name, opts);
  }, []);

  const setMuted = React.useCallback((next: boolean) => arcadeSound.setMuted(next), []);
  const toggleMuted = React.useCallback(
    () => arcadeSound.setMuted(!arcadeSound.muted),
    [],
  );

  return { play, muted, setMuted, toggleMuted };
}
